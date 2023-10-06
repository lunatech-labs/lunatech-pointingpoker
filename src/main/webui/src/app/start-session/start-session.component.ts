import {Component, Input, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {NgbNavModule} from "@ng-bootstrap/ng-bootstrap";
import {CreateRoomComponent} from "./create-room/create-room.component";
import {JoinRoomComponent} from "./join-room/join-room.component";
import {ActivatedRoute} from "@angular/router";

@Component({
  selector: 'app-start-session',
  standalone: true,
  imports: [CommonModule, NgbNavModule, CreateRoomComponent, JoinRoomComponent],
  templateUrl: './start-session.component.html',
})
export class StartSessionComponent implements OnInit {
  activeTab = 1
  @Input("roomId") roomId: string | undefined

  ngOnInit() {
    if (this.roomId != undefined) {
      this.activeTab = 2
    }
  }

}
