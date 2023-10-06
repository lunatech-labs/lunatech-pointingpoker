import { Routes } from '@angular/router';
import {StartSessionComponent} from "./start-session/start-session.component";
import {RoomComponent} from "./room/room.component";

export const routes: Routes = [
  {path: "room/:roomId", component: RoomComponent},
  {path: ":roomId?", component: StartSessionComponent},
  {path: "", component: StartSessionComponent}
];
