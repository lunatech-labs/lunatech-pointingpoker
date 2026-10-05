package com.lunatech.pointingpoker.actors

import java.util.UUID

import scala.concurrent.duration.{DurationInt, FiniteDuration}

import org.apache.pekko.actor.typed.{ActorRef, Behavior, PostStop}
import org.apache.pekko.actor.typed.scaladsl.{ActorContext, Behaviors, TimerScheduler}
import org.apache.pekko.actor.ActorRef as UntypedRef
import com.lunatech.pointingpoker.slug.Slug

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
  final case class Leave(userId: UUID, ref: UntypedRef)       extends Command
  final private[actors] case class ConfirmLeave(userId: UUID) extends Command
  final case class Depart(
      token: SessionToken,
      connectionId: ConnectionId,
      replyTo: ActorRef[CommandResult]
  ) extends Command
  final case class Vote(token: SessionToken, estimation: String, replyTo: ActorRef[VoteResult])
      extends Command
  final case class ClearVotes(token: SessionToken, replyTo: ActorRef[CommandResult]) extends Command
  final case class ReVote(token: SessionToken, replyTo: ActorRef[CommandResult])     extends Command
  final case class ShowVotes(token: SessionToken, replyTo: ActorRef[CommandResult])  extends Command
  final case class EditIssue(token: SessionToken, issue: String, replyTo: ActorRef[CommandResult])
      extends Command
  final case class SwitchRole(token: SessionToken, role: Role, replyTo: ActorRef[CommandResult])
      extends Command
  final case class RequestSession(
      name: String,
      role: Role,
      existing: Option[SessionToken],
      replyTo: ActorRef[SessionMinted]
  ) extends Command
  final case class ValidateToken(token: SessionToken, replyTo: ActorRef[TokenResolution])
      extends Command
  final private[actors] case class GetData(replyTo: ActorRef[DataStatus]) extends Command

  final case class DataStatus(data: RoomData)
  final case class SessionMinted(userId: UUID, token: SessionToken)

  sealed trait TokenResolution
  final case class Resolved(userId: UUID, name: String) extends TokenResolution
  case object Unresolved                                extends TokenResolution

  case object Applied
  enum Refusal:
    case NoSession, NotAMember
  enum VoteRefusal:
    case RoundRevealed, BlankEstimation, NotAVoter
  export Refusal.{NoSession, NotAMember}
  export VoteRefusal.{BlankEstimation, NotAVoter, RoundRevealed}
  // Per endpoint, so the compiler refuses a result the endpoint's status table does not list.
  type CommandResult = Applied.type | Refusal
  type VoteResult    = CommandResult | VoteRefusal

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

  enum Role:
    case Voter, Facilitator

  // A role plus that role's state: the role outlives the round, the estimate does not.
  enum Seat:
    case Voter(estimate: Option[Estimate])
    case Facilitator

    def role: Role = this match
      case Voter(_)    => Role.Voter
      case Facilitator => Role.Facilitator

    def cleared: Seat = this match
      case Voter(_)    => Voter(None)
      case Facilitator => Facilitator

    def unconfirmed: Seat = this match
      case Voter(estimate) => Voter(estimate.map(_.unconfirmed))
      case Facilitator     => Facilitator

    // The switch transition: a change of role starts the new role afresh, so drops any estimate.
    def switchedTo(role: Role): Seat = if role == this.role then this else Seat.of(role)
  end Seat

  object Seat:
    def of(role: Role): Seat = role match
      case Role.Voter       => Voter(None)
      case Role.Facilitator => Facilitator

  // Only what clear replaces whole, so fresh stays a constant.
  final case class Round(revealed: Boolean)

  object Round:
    val fresh: Round = Round(revealed = false)

  final case class RoomState(currentIssue: String, round: Round, seats: Map[UUID, Seat])

  object RoomState:
    val empty: RoomState = RoomState("", Round.fresh, Map.empty)

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

    private[Room] def dropConnection(userId: UUID, connectionId: ConnectionId): RoomData =
      this.copy(connections =
        this.connections.updatedWith(userId)(_.map(_ - connectionId).filter(_.nonEmpty))
      )

    private[Room] def removeMember(userId: UUID): RoomData =
      // Seats are keyed by id and survive a departure; only clear ends an estimate.
      this.copy(members = this.members - userId)

    private[Room] def registerSession(
        token: SessionToken,
        userId: UUID,
        name: String,
        role: Role
    ): RoomData =
      // The only place a session is created, so the only place a seat is.
      this.copy(
        sessions = this.sessions + (token -> Session(userId, name)),
        state = this.state.copy(seats = this.state.seats + (userId -> Seat.of(role)))
      )

    private[Room] def rename(
        token: SessionToken,
        userId: UUID,
        name: String,
        role: Role
    ): RoomData =
      // Both sides or neither: of requires a member's name to equal its session's.
      this
        .copy(
          sessions = this.sessions + (token -> Session(userId, name)),
          members = this.members.updatedWith(userId)(_.map(_ => Member(name)))
        )
        .switched(userId, role)

    // Resolving a token and being allowed to act are two checks: sessions carry no TTL.
    def acting(token: SessionToken): Either[Refusal, UUID] =
      this.sessions.get(token) match
        case None                                       => Left(NoSession)
        case Some(session) if !isMember(session.userId) => Left(NotAMember)
        case Some(session)                              => Right(session.userId)

    def isMember(userId: UUID): Boolean = this.members.contains(userId)

    def holdsConnection(userId: UUID): Boolean = this.connections.contains(userId)

    // The one reading of a seat: of requires one per session, and a missing one reads as fresh.
    private[actors] def seatOf(userId: UUID): Seat =
      this.state.seats.getOrElse(userId, Seat.Voter(None))

    def vote(userId: UUID, estimation: String): (RoomData, Applied.type | VoteRefusal) =
      if this.state.round.revealed then (this, RoundRevealed)
      else if estimation.isBlank then (this, BlankEstimation)
      else
        seatOf(userId) match
          case Seat.Voter(_) =>
            val seats = this.state.seats + (userId -> Seat.Voter(Some(Estimate.of(estimation))))
            (withState(this.state.round, seats).latched, Applied)
          case Seat.Facilitator => (this, NotAVoter)

    // Only a change of seat latches, so a same-role switch never reveals a round left complete.
    def switchRole(userId: UUID, role: Role): RoomData =
      val next = switched(userId, role)
      if next.seatOf(userId) == seatOf(userId) then this else next.latched

    def show(): RoomData  = withState(this.state.round.copy(revealed = true), this.state.seats)
    def clear(): RoomData = withState(Round.fresh, this.state.seats.view.mapValues(_.cleared).toMap)
    def reVote(): RoomData =
      withState(
        this.state.round.copy(revealed = false),
        this.state.seats.view.mapValues(_.unconfirmed).toMap
      )

    def editIssue(issue: String): RoomData =
      this.copy(state = this.state.copy(currentIssue = issue))

    private def withState(round: Round, seats: Map[UUID, Seat]): RoomData =
      this.copy(state = this.state.copy(round = round, seats = seats))

    private def switched(userId: UUID, role: Role): RoomData =
      withState(this.state.round, this.state.seats + (userId -> seatOf(userId).switchedTo(role)))

    // The latch step: only a deliberate act by someone present runs it (decision 1).
    private def latched: RoomData =
      if this.state.round.revealed || !complete then this
      else withState(this.state.round.copy(revealed = true), this.state.seats)

    // The Terms' "Complete".
    private def complete: Boolean =
      val confirmations = this.members.keys.toList.flatMap(id =>
        seatOf(id) match
          case Seat.Voter(estimate) => Some(estimate.exists(_.confirmed))
          case Seat.Facilitator     => None
      )
      confirmations.nonEmpty && confirmations.forall(identity)
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
      // a connection or a seat outliving its member is a state this design requires.
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
      identities.foreach((id, session) =>
        require(state.seats.contains(id), s"the session for ${session.name} ($id) has no seat")
      )
      state.seats.keys.foreach(id =>
        require(identities.contains(id), s"the seat for $id resolves to no session")
      )
      RoomData(state, members, sessions, connections)
    end of
  end RoomData

  private[actors] case object IdleTick extends Command

  private case object IdleTickKey

  private def armIdleTick(timers: TimerScheduler[Command], stopAfterIdle: FiniteDuration): Unit =
    timers.startSingleTimer(IdleTickKey, IdleTick, stopAfterIdle)

  def apply(
      roomId: Slug,
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
      roomId: Slug,
      data: RoomData,
      gracePeriod: FiniteDuration,
      stopAfterIdle: FiniteDuration,
      timers: TimerScheduler[Command]
  ): Behavior[Command] =
    Behaviors
      .receive[Command] { (context, message) =>
        // The commands whose only outcome past the membership check is an update and a publish.
        def act(token: SessionToken, replyTo: ActorRef[CommandResult])(
            update: (RoomData, UUID) => RoomData
        ): Behavior[Command] =
          data.acting(token) match
            case Right(userId) =>
              replyTo ! Applied
              receiveBehaviour(
                roomId,
                publish(update(data, userId), context),
                gracePeriod,
                stopAfterIdle,
                timers
              )
            case Left(refusal) =>
              replyTo ! refusal
              Behaviors.same

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
            // A same-id restart or rename between resolution and Join. Warn, not raise, which stops
            // the room; a refused joiner gets no snapshot and, deliberately, no connection.
            if data.sessions.get(token).contains(Session(userId, name)) then
              // The arriving connection cancels any pending removal, so ConfirmLeave needs no
              // staleness check of its own.
              timers.cancel(userId)
              // Ended, not parked: a displaced live stream would get heartbeats but no snapshot.
              data.connections.get(userId).flatMap(_.get(connectionId)).foreach(_ ! StreamCompleted)
              val newData = publish(data.connect(userId, name, connectionId, ref), context)
              receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
            else
              val reason =
                if data.sessions.contains(token) then
                  "its token's session names a different identity"
                else "its token resolves to no session"
              context.log.warn("Ignoring Join for user {} in room {}: {}.", userId, roomId, reason)
              // The stream is ended rather than left open: a refused page has nothing coming.
              ref ! StreamCompleted
              Behaviors.same
          case RequestSession(name, role, existing, replyTo) =>
            existing.flatMap(t => data.sessions.get(t).map(t -> _)) match
              case Some((token, session)) =>
                // Taking the name rather than ignoring it is the nearest this app has to a rename.
                val newData = publish(data.rename(token, session.userId, name, role), context)
                replyTo ! SessionMinted(session.userId, token)
                receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
              case None =>
                val userId  = UUID.randomUUID()
                val token   = SessionToken.mint()
                val newData = data.registerSession(token, userId, name, role)
                replyTo ! SessionMinted(userId, token)
                receiveBehaviour(roomId, newData, gracePeriod, stopAfterIdle, timers)
          case Vote(token, estimation, replyTo) =>
            data.acting(token) match
              case Right(userId) =>
                val (next, outcome) = data.vote(userId, estimation)
                replyTo ! outcome
                receiveBehaviour(roomId, publish(next, context), gracePeriod, stopAfterIdle, timers)
              case Left(refusal) =>
                replyTo ! refusal
                Behaviors.same
          case ClearVotes(token, replyTo) =>
            act(token, replyTo)((room, _) => room.clear())
          case ReVote(token, replyTo) =>
            act(token, replyTo)((room, _) => room.reVote())
          case ShowVotes(token, replyTo) =>
            act(token, replyTo)((room, _) => room.show())
          case SwitchRole(token, role, replyTo) =>
            act(token, replyTo)(_.switchRole(_, role))
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
          case Depart(token, connectionId, replyTo) =>
            data.acting(token) match
              case Right(userId) =>
                replyTo ! Applied
                // The server ends the stream it removes deliberately, the same rule a refused
                // Join follows. A ref whose stream already ended dead-letters harmlessly.
                data.connections
                  .get(userId)
                  .flatMap(_.get(connectionId))
                  .foreach(_ ! StreamCompleted)
                val next = data.dropConnection(userId, connectionId)
                if next.holdsConnection(userId) then
                  receiveBehaviour(roomId, next, gracePeriod, stopAfterIdle, timers)
                else
                  // Removing the member cancels the grace timer, so only one path publishes.
                  timers.cancel(userId)
                  receiveBehaviour(
                    roomId,
                    publish(next.removeMember(userId), context),
                    gracePeriod,
                    stopAfterIdle,
                    timers
                  )
                end if
              case Left(refusal) =>
                replyTo ! refusal
                Behaviors.same
          case EditIssue(token, issue, replyTo) =>
            act(token, replyTo)((room, _) => room.editIssue(issue))
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
