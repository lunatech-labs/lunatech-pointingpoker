package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.{DurationInt, FiniteDuration}

import org.apache.pekko.actor.typed.{ActorRef, Behavior}
import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors, TimerScheduler}
import org.apache.pekko.actor.ActorRef as UntypedRef

object Room:

  opaque type SessionToken = UUID

  object SessionToken:
    def mint(): SessionToken                        = UUID.randomUUID()
    def parse(raw: String): Option[SessionToken]    = scala.util.Try(UUID.fromString(raw)).toOption
    extension (token: SessionToken) def raw: String = token.toString

  sealed trait Command
  final case class Join(userId: UUID, name: String, token: SessionToken, ref: UntypedRef)
      extends Command
  final case class Leave(userId: UUID, ref: UntypedRef, replyTo: ActorRef[Response]) extends Command
  final private[actors] case class ConfirmLeave(userId: UUID, replyTo: ActorRef[Response])
      extends Command
  final case class Vote(token: SessionToken, estimation: String)                  extends Command
  final case class ClearVotes(token: SessionToken)                                extends Command
  final case class ReVote(token: SessionToken)                                    extends Command
  final case class ShowVotes(token: SessionToken)                                 extends Command
  final case class EditIssue(token: SessionToken, issue: String)                  extends Command
  final case class RequestSession(name: String, replyTo: ActorRef[SessionMinted]) extends Command
  final case class ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution])
      extends Command
  final private[actors] case class GetData(replyTo: ActorRef[DataStatus]) extends Command

  final case class DataStatus(data: RoomData)
  final case class SessionMinted(userId: UUID, token: SessionToken)

  sealed trait TokenResolution
  final case class Resolved(userId: UUID, name: String) extends TokenResolution
  case object Unresolved                                extends TokenResolution

  sealed trait Response
  final case class Running(roomId: UUID) extends Response
  final case class Stopped(roomId: UUID) extends Response

  final case class Estimate private (value: String, confirmed: Boolean):
    // copy is private with the constructor, so the re-vote transition lives on the type.
    def unconfirmed: Estimate = this.copy(confirmed = false)

  object Estimate:
    def of(value: String, confirmed: Boolean = true): Estimate =
      // vote refuses a blank before this, so an invalid estimate is a programming error.
      require(!value.isBlank, "an estimate needs a value")
      Estimate(value, confirmed)

  final case class Round(estimates: Map[UUID, Estimate], revealed: Boolean)

  object Round:
    val fresh: Round = Round(Map.empty[UUID, Estimate], revealed = false)

  final case class RoomState(currentIssue: String, round: Round)

  object RoomState:
    val empty: RoomState = RoomState("", Round.fresh)

  final case class Session(userId: UUID, name: String)

  final case class Member(name: String)

  final case class RoomData private (
      state: RoomState,
      members: Map[UUID, Member],
      sessions: Map[SessionToken, Session],
      connections: Map[UUID, Set[UntypedRef]]
  ):
    private[Room] def connect(userId: UUID, name: String, ref: UntypedRef): RoomData =
      this.copy(
        members = this.members + (userId -> Member(name)),
        connections =
          this.connections.updatedWith(userId)(refs => Some(refs.getOrElse(Set.empty) + ref))
      )

    private[Room] def disconnect(userId: UUID, ref: UntypedRef): RoomData =
      // The entry goes when its set empties, so "holds no connection" means what it says.
      this.copy(connections =
        this.connections.updatedWith(userId)(_.map(_ - ref).filter(_.nonEmpty))
      )

    private[Room] def removeMember(userId: UUID): RoomData =
      // Estimates are keyed by id and survive a departure; only clear or the round ends one.
      this.copy(members = this.members - userId)

    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(sessions = this.sessions + (token -> Session(userId, name)))

    // Resolving a token and being allowed to act are two checks: sessions carry no TTL.
    def actingMember(token: SessionToken): Option[UUID] =
      this.sessions.get(token).map(_.userId).filter(this.members.contains)

    def isMember(userId: UUID): Boolean = this.members.contains(userId)

    def holdsConnection(userId: UUID): Boolean = this.connections.contains(userId)

    def vote(userId: UUID, estimation: String): RoomData = // unchanged from task 1
      if this.state.round.revealed || estimation.isBlank then this
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        withRound(Round(estimates, everyMemberHasVoted(estimates)))
    end vote

    def show(): RoomData   = withRound(this.state.round.copy(revealed = true))
    def clear(): RoomData  = withRound(Round.fresh)
    def reVote(): RoomData =
      withRound(Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, false))

    def editIssue(issue: String): RoomData =
      this.copy(state = this.state.copy(currentIssue = issue))

    private def withRound(round: Round): RoomData =
      this.copy(state = this.state.copy(round = round))

    private def everyMemberHasVoted(estimates: Map[UUID, Estimate]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      this.members.nonEmpty && this.members.keys.forall(id => estimates.get(id).exists(_.confirmed))
  end RoomData

  object RoomData:
    val empty: RoomData = of()

    def of(
        state: RoomState = RoomState.empty,
        members: Map[UUID, Member] = Map.empty,
        sessions: Map[SessionToken, Session] = Map.empty,
        connections: Map[UUID, Set[UntypedRef]] = Map.empty
    ): RoomData =
      // Every id resolves to a session, which is conspicuously not "every id is a member":
      // a connection or an estimate outliving its member is a state this design requires.
      val identities = sessions.values.map(s => s.userId -> s).toMap
      members.foreach { (id, member) =>
        require(identities.contains(id), s"member ${member.name} ($id) has no session")
        require(
          identities(id).name == member.name,
          s"the session for member ${member.name} ($id) holds a different name"
        )
      }
      connections.keys.foreach(id =>
        require(identities.contains(id), s"the connection for $id resolves to no session")
      )
      state.round.estimates.keys.foreach(id =>
        require(identities.contains(id), s"the estimate for $id resolves to no session")
      )
      RoomData(state, members, sessions, connections)
    end of
  end RoomData

  val defaultGracePeriod: FiniteDuration = 6.seconds

  def apply(
      roomId: UUID,
      initialData: RoomData = RoomData.empty,
      gracePeriod: FiniteDuration = defaultGracePeriod
  ): Behavior[Command] =
    Behaviors.setup[Command] { _ =>
      Behaviors.withTimers[Command] { timers =>
        receiveBehaviour(roomId, initialData, gracePeriod, timers)
      }
    }

  private[actors] def receiveBehaviour(
      roomId: UUID,
      data: RoomData,
      gracePeriod: FiniteDuration,
      timers: TimerScheduler[Command]
  ): Behavior[Command] =
    Behaviors.receive[Command] { (context, message) =>
      message match
        case Join(userId, name, token, ref) =>
          // Needs a same-id restart between resolution and Join. Warn, not raise, which stops
          // the room; a refused joiner gets no snapshot and, deliberately, no connection.
          if data.sessions.get(token).contains(Session(userId, name)) then
            // The arriving connection cancels any pending removal, so ConfirmLeave needs no
            // staleness check of its own.
            timers.cancel(userId)
            val newData = publish(data.connect(userId, name, ref), context)
            receiveBehaviour(roomId, newData, gracePeriod, timers)
          else
            val reason =
              if data.sessions.contains(token) then "its token's session names a different identity"
              else "its token resolves to no session"
            context.log.warn("Ignoring Join for user {} in room {}: {}.", userId, roomId, reason)
            Behaviors.same
        case RequestSession(name, replyTo) =>
          val userId  = UUID.randomUUID()
          val token   = SessionToken.mint()
          val newData = data.registerSession(token, userId, name)
          replyTo ! SessionMinted(userId, token)
          receiveBehaviour(roomId, newData, gracePeriod, timers)
        case Vote(token, estimation) =>
          data.actingMember(token) match
            case Some(userId) =>
              receiveBehaviour(
                roomId,
                publish(data.vote(userId, estimation), context),
                gracePeriod,
                timers
              )
            case None => Behaviors.same
        case ClearVotes(token) =>
          data.actingMember(token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.clear(), context), gracePeriod, timers)
            case None => Behaviors.same
        case ReVote(token) =>
          data.actingMember(token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.reVote(), context), gracePeriod, timers)
            case None => Behaviors.same
        case ShowVotes(token) =>
          data.actingMember(token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.show(), context), gracePeriod, timers)
            case None => Behaviors.same
        case Leave(userId, ref, replyTo) =>
          // Answerable at the moment of the event now that connections are their own map: a
          // member still holding one, or already removed, schedules nothing.
          val next = data.disconnect(userId, ref)
          if !next.holdsConnection(userId) && next.isMember(userId) then
            timers.startSingleTimer(
              key = userId,
              msg = ConfirmLeave(userId, replyTo),
              delay = gracePeriod
            )
          receiveBehaviour(roomId, next, gracePeriod, timers)
        case ConfirmLeave(userId, replyTo) =>
          val newData = publish(data.removeMember(userId), context)
          if newData.members.isEmpty then
            replyTo ! Stopped(roomId)
            Behaviors.stopped
          else
            replyTo ! Running(roomId)
            receiveBehaviour(roomId, newData, gracePeriod, timers)
        case EditIssue(token, issue) =>
          data.actingMember(token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.editIssue(issue), context), gracePeriod, timers)
            case None => Behaviors.same
        case ValidateToken(token, replyTo) =>
          // The map is the single authority now that it is retained: a member removed at
          // grace expiry still resolves, which is what makes their retry a rejoin, not a 401.
          val resolution = data.sessions.get(token) match
            case Some(session) => Resolved(session.userId, session.name)
            case None          => Unresolved
          replyTo ! resolution
          Behaviors.same
        case GetData(replyTo) =>
          replyTo ! Room.DataStatus(data)
          Behaviors.same

    }

  private[actors] def publish(data: RoomData, context: ActorContext[Command]): RoomData =
    // The Join to publish hop races a new connection's demand, benign while dropHead leaves a
    // newer full snapshot. 08-24 measured it under fail; re-check if that guarantee changes.
    context.log.debug("Publishing to {} connected members", data.connections.size)
    // One snapshot per member, shared by that member's connections: redaction is per identity.
    data.connections.foreach { (id, refs) =>
      val snapshot = RoomSnapshot.of(data, id)
      refs.foreach(_ ! snapshot)
    }
    data
  end publish
end Room
