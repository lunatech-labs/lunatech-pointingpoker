import {Component, Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";

@Component({
  selector: 'app-join-room',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './join-room.component.html',
})
export class JoinRoomComponent {
  submitted = false;
  joinForm = new FormGroup({
      roomId: new FormControl("", [
        Validators.required
      ]),
      userName: new FormControl("", [
        Validators.required, Validators.minLength(3)
      ])
    },
    {updateOn: "submit"})

  @Input()
  set roomId(roomId: string) {
    this.roomControl().setValue(roomId)
    this.roomControl().disable()
  }

  protected roomControl() {
    return this.joinForm.controls.roomId
  }

  protected userNameControl() {
    return this.joinForm.controls.userName
  }

  protected onSubmit() {
    this.submitted = true;
    console.log(this.joinForm)
  }
}
