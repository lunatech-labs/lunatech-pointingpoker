package com.lunatech.pointingpoker

import akka.actor.{ActorRef, ActorSystem}
import com.lunatech.pointingpoker.config.ApiConfig


object Main extends App {

  implicit val system: ActorSystem = ActorSystem("pointing-poker")

  val roomManager: ActorRef = system.actorOf(RoomManager.props(), "room-manager")
  val apiConfig: ApiConfig = ApiConfig.load(system.settings.config)

  val api = API(roomManager, apiConfig)
  api.run()
}
