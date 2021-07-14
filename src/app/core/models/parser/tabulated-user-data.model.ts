import { Admins } from "./admins.model";
import { Roles } from "./roles.model";
import { Students } from "./students.model";
import { Teams } from "./teams.model";
import { Tutors } from "./tutors.model";

export interface TabulatedUserData {
  "admins-allocation"?: Admins;
  roles?: Roles;
  "students-allocation"?: Students;
  "team-structure"?: Teams;
  "tutors-allocation"?: Tutors;
}
