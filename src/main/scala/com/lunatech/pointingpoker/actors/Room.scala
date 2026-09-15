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
  final case class Join(user: User)                                                  extends Command
  final case class Leave(userId: UUID, ref: UntypedRef, replyTo: ActorRef[Response]) extends Command
  final private[actors] case class ConfirmLeave(
      userId: UUID,
      ref: UntypedRef,
      replyTo: ActorRef[Response]
  ) extends Command
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

  final case class User(id: UUID, name: String, ref: UntypedRef, token: SessionToken)

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

  final case class RoomData private (
      users: List[User],
      state: RoomState,
      sessions: Map[SessionToken, Session] = Map.empty
  ):
    private[Room] def joinUser(user: User): RoomData =
      // Nothing to carry over: the estimate is keyed by user id in the round, not on the entry.
      this.copy(users = user :: this.users.filterNot(_.id == user.id))

    private[Room] def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(sessions = this.sessions + (token -> Session(userId, name)))

    def vote(userId: UUID, estimation: String): RoomData =
      // The reveal closes the round, and a blank estimation is the absence of a value, which
      // presence-based hasEstimation would otherwise admit to the client's tally.
      if this.state.round.revealed || estimation.isBlank then this
      else
        val estimates = this.state.round.estimates + (userId -> Estimate.of(estimation))
        // Still a latch: only a vote or ShowVotes sets it, so a departure reveals nothing.
        withRound(Round(estimates, everyUserHasVoted(estimates)))
    end vote

    def show(): RoomData =
      withRound(this.state.round.copy(revealed = true))

    def clear(): RoomData =
      withRound(Round.fresh)

    def reVote(): RoomData =
      // Keeps the values, which is what makes an estimate without a confirmation a re-vote.
      withRound(Round(this.state.round.estimates.view.mapValues(_.unconfirmed).toMap, false))

    def leave(userId: UUID, ref: UntypedRef): RoomData =
      // Scoped to the specific connection's ref, not just userId, so a stale connection's
      // delayed teardown can't evict a newer connection the same user reconnected with.
      this.copy(users = this.users.filterNot(u => u.id == userId && u.ref == ref))

    def editIssue(issue: String): RoomData =
      this.copy(state = this.state.copy(currentIssue = issue))

    private def withRound(round: Round): RoomData =
      this.copy(state = this.state.copy(round = round))

    private def everyUserHasVoted(estimates: Map[UUID, Estimate]): Boolean =
      // nonEmpty is insurance rather than a live case: only a Vote ever runs this.
      this.users.nonEmpty && this.users.forall(u => estimates.get(u.id).exists(_.confirmed))
  end RoomData

  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], RoomState.empty)

    def of(
        users: List[User],
        sessions: Map[SessionToken, Session],
        state: RoomState = RoomState.empty
    ): RoomData =
      // Invariant 5: ConnectToRoom creates every member off a resolved session, so a
      // member whose session is missing or disagrees is a fixture error, never a state.
      users.foreach { u =>
        require(sessions.contains(u.token), s"member ${u.name} (${u.id}) has no session")
        require(
          sessions(u.token) == Session(u.id, u.name),
          s"the session for member ${u.name} (${u.id}) holds a different identity"
        )
      }
      // The round outlives membership, so its keys are checked against sessions, not users.
      val identities = sessions.values.map(_.userId).toSet
      state.round.estimates.keys.foreach { id =>
        require(identities.contains(id), s"the estimate for $id resolves to no session")
      }
      RoomData(users, state, sessions)
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
        case Join(user) =>
          // Needs a same-id restart between resolution and Join. Warn, not raise, which stops
          // the room; publish is member-scoped, so a refused joiner gets no snapshot.
          if data.sessions.get(user.token).contains(Session(user.id, user.name)) then
            receiveBehaviour(roomId, publish(data.joinUser(user), context), gracePeriod, timers)
          else
            val reason =
              if data.sessions.contains(user.token) then
                "its token's session names a different identity"
              else "its token resolves to no session"
            context.log.warn("Ignoring Join for user {} in room {}: {}.", user.id, roomId, reason)
            Behaviors.same
        case RequestSession(name, replyTo) =>
          val userId  = UUID.randomUUID()
          val token   = SessionToken.mint()
          val newData = data.registerSession(token, userId, name)
          replyTo ! SessionMinted(userId, token)
          receiveBehaviour(roomId, newData, gracePeriod, timers)
        case Vote(token, estimation) =>
          data.users.find(_.token == token) match
            case Some(user) =>
              val newData = publish(data.vote(user.id, estimation), context)
              receiveBehaviour(roomId, newData, gracePeriod, timers)
            case None => Behaviors.same
        case ClearVotes(token) =>
          data.users.find(_.token == token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.clear(), context), gracePeriod, timers)
            case None => Behaviors.same
        case ReVote(token) =>
          data.users.find(_.token == token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.reVote(), context), gracePeriod, timers)
            case None => Behaviors.same
        case ShowVotes(token) =>
          data.users.find(_.token == token) match
            case Some(_) =>
              receiveBehaviour(roomId, publish(data.show(), context), gracePeriod, timers)
            case None => Behaviors.same
        case Leave(userId, ref, replyTo) =>
          // Delay acting on this until the grace period elapses (see ConfirmLeave below),
          // instead of removing the user and broadcasting Leave right away. A reconnect
          // within that window (retry after a dropped SSE stream, a page refresh, an
          // ordinary network blip) replaces this ref via Join before the timer fires, so
          // the rest of the room never sees a spurious leave-then-rejoin flicker.
          //
          // Keying the timer on (userId, ref) relies on RoomManager calling Leave at most
          // once per connection (ConnectionCompleted and ConnectionFailure are mutually
          // exclusive outcomes of the same watchTermination). If that ever stops holding, a
          // second Leave for the same (userId, ref) replaces the pending timer rather than
          // running two independent ones, restarting the grace period from the second call
          // instead of the first - see the "reset the grace period" case in RoomSpec.
          if timers.isTimerActive((userId, ref)) then
            context.log.warn(
              "Leave received again for user {} on the same connection before its prior " +
                "grace period elapsed; resetting the grace period instead of firing twice. " +
                "RoomManager is expected to call Leave at most once per connection.",
              userId
            )
          timers.startSingleTimer(
            key = (userId, ref),
            msg = ConfirmLeave(userId, ref, replyTo),
            delay = gracePeriod
          )
          Behaviors.same
        case ConfirmLeave(userId, ref, replyTo) =>
          if data.users.exists(u => u.id == userId && u.ref == ref) then
            val newData = publish(data.leave(userId, ref), context)
            if newData.users.isEmpty then
              replyTo ! Stopped(roomId)
              Behaviors.stopped
            else
              replyTo ! Running(roomId)
              receiveBehaviour(roomId, newData, gracePeriod, timers)
          else
            // Stale teardown: this userId already reconnected under a different ref
            // (joinUser replaced the entry), so there's nothing left to remove.
            Behaviors.same
        case EditIssue(token, issue) =>
          data.users.find(_.token == token) match
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
    context.log.debug("Publishing to {} users", data.users.size)
    // Recipient and redaction target are one value here, so the pairing holds by construction.
    // Step 4's connections map makes it a lookup; RoomSpec's two-probe cases are its guard.
    data.users.foreach(user => user.ref ! RoomSnapshot.of(data, user.id))
    data
  end publish
end Room
