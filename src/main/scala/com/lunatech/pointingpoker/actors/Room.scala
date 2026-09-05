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

  final case class User(
      id: UUID,
      name: String,
      voted: Boolean,
      estimation: String,
      ref: UntypedRef,
      token: SessionToken
  )

  final case class PendingSession(userId: UUID, name: String)

  final case class RoomData(
      users: List[User],
      currentIssue: String,
      revealed: Boolean = false,
      pendingSessions: Map[SessionToken, PendingSession] = Map.empty
  ):
    def joinUser(user: User): RoomData =
      // ConnectToRoom rebuilds the User with an empty vote, so keep the stored one; only
      // ref actually differs on a reconnect, there being no rename feature.
      val kept = this.users
        .find(_.id == user.id)
        .fold(user)(old => user.copy(voted = old.voted, estimation = old.estimation))
      this.copy(
        users = kept :: this.users.filterNot(_.id == user.id),
        pendingSessions = this.pendingSessions - user.token
      )
    end joinUser

    def registerSession(token: SessionToken, userId: UUID, name: String): RoomData =
      this.copy(pendingSessions = this.pendingSessions + (token -> PendingSession(userId, name)))

    def vote(userId: UUID, estimation: String): RoomData =
      val voted = this.users.map { u =>
        if userId == u.id then u.copy(voted = true, estimation = estimation)
        else u
      }
      // A latch, so only a vote or ShowVotes reveals; a departure satisfying the same
      // predicate must not, which is the disclosure step 2 exists to prevent.
      this.copy(
        users = voted,
        revealed = this.revealed || (voted.nonEmpty && voted.forall(_.voted))
      )
    end vote

    def show(): RoomData =
      this.copy(revealed = true)

    def clear(): RoomData =
      this.copy(users = this.users.map(_.copy(voted = false, estimation = "")), revealed = false)

    def reVote(): RoomData =
      // Keeps estimation, which is what makes "estimation but not voted" mean re-vote.
      this.copy(users = this.users.map(u => u.copy(voted = false)), revealed = false)

    def leave(userId: UUID, ref: UntypedRef): RoomData =
      // Scoped to the specific connection's ref, not just userId, so a stale connection's
      // delayed teardown can't evict a newer connection the same user reconnected with.
      this.copy(users = this.users.filterNot(u => u.id == userId && u.ref == ref))

    def editIssue(issue: String): RoomData =
      this.copy(currentIssue = issue)
  end RoomData

  object RoomData:
    val empty: RoomData = RoomData(List.empty[User], "")

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
          receiveBehaviour(roomId, publish(data.joinUser(user), context), gracePeriod, timers)
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
          val resolution = data.pendingSessions.get(token) match
            case Some(pending) => Resolved(pending.userId, pending.name)
            case None          =>
              data.users.find(_.token == token) match
                case Some(user) => Resolved(user.id, user.name)
                case None       => Unresolved
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
    data.users.foreach(user => user.ref ! RoomSnapshot.of(data, user.id))
    data
  end publish
end Room
