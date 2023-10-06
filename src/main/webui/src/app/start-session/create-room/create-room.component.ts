import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './create-room.component.html',
})
export class CreateRoomComponent {
  submitted = false
  createForm = new FormGroup({
      userName: new FormControl(null, [
        Validators.required,
        Validators.minLength(3)
      ])
    },
    {updateOn: 'submit'}
  );

  userName() {
    return this.createForm.controls.userName
  }

  protected onSubmit() {
    this.submitted = true
    console.log(this.createForm.status)
    console.log(this.createForm)
  }
}
