package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.{DurationInt, FiniteDuration}

import org.apache.pekko.actor.typed.{ActorRef, Behavior, PostStop}
import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors, TimerScheduler}
import org.apache.pekko.actor.ActorRef as UntypedRef

object Room:

  opaque type SessionToken = UUID

  object SessionToken:
    def mint(): SessionToken                        = UUID.randomUUID()
    def parse(raw: String): Option[SessionToken]    = scala.util.Try(UUID.fromString(raw)).toOption
    extension (token: SessionToken) def raw: String = token.toString

  opaque type ConnectionId = UUID

  object ConnectionId:
    def parse(raw: String): Option[ConnectionId] =
      scala.util.Try(UUID.fromString(raw)).toOption
    extension (id: ConnectionId) def raw: String = id.toString

  sealed trait Command
  final case class Join(
      userId: UUID,
      name: String,
      token: SessionToken,
      connectionId: ConnectionId,
      ref: UntypedRef
  ) extends Command
  final case class Leave(userId: UUID, ref: UntypedRef)                           extends Command
  final private[actors] case class ConfirmLeave(userId: UUID)                     extends Command
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

  // Not a Command: it travels outward to untyped connection refs, so publish's send fits it.
  case object StreamCompleted

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
      connections: Map[UUID, Map[ConnectionId, UntypedRef]]
  ):
    private[Room] def connect(
        userId: UUID,
        name: String,
        connectionId: ConnectionId,
        ref: UntypedRef
    ): RoomData =
      // Replacing by id is what stops a page that reconnects being fed through two streams.
      this.copy(
        members = this.members + (userId -> Member(name)),
        connections = this.connections.updatedWith(userId)(refs =>
          Some(refs.getOrElse(Map.empty) + (connectionId -> ref))
        )
      )

    private[Room] def disconnect(userId: UUID, ref: UntypedRef): RoomData =
      // By value, never by id: removing by id would evict a live replacement.
      this.copy(connections =
        this.connections.updatedWith(userId)(_.map(_.filterNot(_._2 == ref)).filter(_.nonEmpty))
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
      withRound(
        Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, revealed = false)
      )

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
        connections: Map[UUID, Map[ConnectionId, UntypedRef]] = Map.empty
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

  private[actors] case object IdleTick extends Command

  private case object IdleTickKey

  private def armIdleTick(timers: TimerScheduler[Command], stopAfterIdle: FiniteDuration): Unit =
    timers.startSingleTimer(IdleTickKey, IdleTick, stopAfterIdle)

  def apply(
      roomId: UUID,
      initialData: RoomData = RoomData.empty,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration
  ): Behavior[Command] =
    Behaviors.setup[Command] { _ =>
      Behaviors.withTimers[Command] { timers =>
        armIdleTick(timers, stopAfterIdle)
        receiveBehaviour(roomId, initialData, gracePeriod, stopAfterIdle, timers)
      }
    }

  private[actors] def receiveBehaviour(
      roomId: UUID,
      data: RoomData,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration,
      timers: TimerScheduler[Command]
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        // Any message re-arms the tick a full delay out, so none lands between ValidateToken and
        // ConnectToRoom. Invariant: connections change only on this path, so the timer is exact.
        if message != IdleTick then armIdleTick(timers, stopAfterIdle)
        // Re-arming also voids a tick already in the mailbox: Pekko discards a timer message
        // from a superseded generation. Verified against pekko-actor-typed 1.7.0.
        message match
          case IdleTick =>
            if data.connections.isEmpty then
              context.log.info("Stopping room {}: no connection for {}", roomId, stopAfterIdle)
              Behaviors.stopped
            else
              armIdleTick(timers, stopAfterIdle)
              Behaviors.same
          case Join(userId, name, token, connectionId, ref) =>
            // Needs a same-id restart between resolution and Join. Warn, not raise, which stops
            // the room; a refused joiner gets no snapshot and, deliberately, no connection.
            if data.sessions.get(token).contains(Session(userId, name)) then
              // The arriving connection cancels any pending removal, so ConfirmLeave needs no
              // staleness check of its own.
              timers.cancel(userId)
              val newData = publish(data.connect(userId, name, connectionId, ref), context)
              receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
            else
              val reason =
                if data.sessions.contains(token) then
                  "its token's session names a different identity"
                else "its token resolves to no session"
              context.log.warn("Ignoring Join for user {} in room {}: {}.", userId, roomId, reason)
              Behaviors.same
          case RequestSession(name, replyTo) =>
            val userId  = UUID.randomUUID()
            val token   = SessionToken.mint()
            val newData = data.registerSession(token, userId, name)
            replyTo ! SessionMinted(userId, token)
            receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
          case Vote(token, estimation) =>
            data.actingMember(token) match
              case Some(userId) =>
                receiveBehaviour(
                  roomId,
                  publish(data.vote(userId, estimation), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
              case None => Behaviors.same
          case ClearVotes(token) =>
            data.actingMember(token) match
              case Some(_) =>
                receiveBehaviour(
                  roomId,
                  publish(data.clear(), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
              case None => Behaviors.same
          case ReVote(token) =>
            data.actingMember(token) match
              case Some(_) =>
                receiveBehaviour(
                  roomId,
                  publish(data.reVote(), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
              case None => Behaviors.same
          case ShowVotes(token) =>
            data.actingMember(token) match
              case Some(_) =>
                receiveBehaviour(
                  roomId,
                  publish(data.show(), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
              case None => Behaviors.same
          case Leave(userId, ref) =>
            // Answerable at the moment of the event now that connections are their own map: a
            // member still holding one, or already removed, schedules nothing.
            val next = data.disconnect(userId, ref)
            if !next.holdsConnection(userId) && next.isMember(userId) then
              timers.startSingleTimer(key = userId, msg = ConfirmLeave(userId), delay = gracePeriod)
            receiveBehaviour(roomId, next, gracePeriod, stopAfterIdle, timers)
          case ConfirmLeave(userId) =>
            val newData = publish(data.removeMember(userId), context)
            receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
          case EditIssue(token, issue) =>
            data.actingMember(token) match
              case Some(_) =>
                receiveBehaviour(
                  roomId,
                  publish(data.editIssue(issue), context),
                  gracePeriod,
                  stopAfterIdle,
                  timers
                )
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
        end match

      }
      .receiveSignal { case (_, PostStop) =>
        // A room that stops owes its attached streams an answer; the alternative is silence.
        data.connections.values.flatMap(_.values).foreach(_ ! StreamCompleted)
        Behaviors.same
      }

  private[actors] def publish(data: RoomData, context: ActorContext[Command]): RoomData =
    // The Join to publish hop races a new connection's demand, benign while dropHead leaves a
    // newer full snapshot. 08-24 measured it under fail; re-check if that guarantee changes.
    context.log.debug("Publishing to {} connected members", data.connections.size)
    // One snapshot per member, shared by that member's connections: redaction is per identity.
    data.connections.foreach { (id, refs) =>
      val snapshot = RoomSnapshot.of(data, id)
      refs.values.foreach(_ ! snapshot)
    }
    data
  end publish
end Room
