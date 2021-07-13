import { Injectable } from '@angular/core';
import { GithubService } from './github.service';
import { User, UserRole } from '../models/user.model';
import { filter, map, throwIfEmpty } from 'rxjs/operators';
import { Team } from '../models/team.model';
import { Observable } from 'rxjs';
import { DataService } from './data.service';
import { GithubUser } from '../models/github-user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  public currentUser: User;

  constructor(private githubService: GithubService, private dataService: DataService) {}

  /**
   * Get the authenticated user if it exist.
   */
  getAuthenticatedUser(): Observable<GithubUser> {
    return this.githubService.fetchAuthenticatedUser().pipe(
      map((data: GithubUser) => {
        return data;
      })
    );
  }

  createUserModel(userLoginId: string): Observable<User> {
    return this.dataService.getDataFile().pipe(
      map((jsonData: {}) => {
        this.currentUser = this.createUser(jsonData, userLoginId);
        return this.currentUser;
      }),
      filter((user) => user !== null),
      throwIfEmpty(() => new Error('Unauthorized user.'))
    );
  }

  reset() {
    this.currentUser = undefined;
  }

  private createUser(data: {}, userLoginId: string): User {
    const lowerCaseUserLoginId = userLoginId.toLowerCase();

    const userRole = this.parseUserRole(data, lowerCaseUserLoginId);
    switch (userRole) {
      case UserRole.Student:
        const teamId = data[DataService.STUDENTS_ALLOCATION][lowerCaseUserLoginId][DataService.TEAM_ID];
        const studentTeam = this.createTeamModel(data[DataService.TEAM_STRUCTURE], teamId);
        return <User>{ loginId: userLoginId, role: userRole, team: studentTeam };

      case UserRole.Tutor:
        const tutorTeams: Array<Team> = Object.keys(
          data[DataService.TUTORS_ALLOCATION][lowerCaseUserLoginId]
        ).map((allocatedTeamId: string) => this.createTeamModel(data[DataService.TEAM_STRUCTURE], allocatedTeamId));

        return <User>{ loginId: userLoginId, role: userRole, allocatedTeams: tutorTeams };

      case UserRole.Admin:
        const studentTeams: Array<Team> = Object.keys(
          data[DataService.ADMINS_ALLOCATION][lowerCaseUserLoginId]
        ).map((allocatedTeamId: string) => this.createTeamModel(data[DataService.TEAM_STRUCTURE], allocatedTeamId));

        return <User>{ loginId: userLoginId, role: userRole, allocatedTeams: studentTeams };
      default:
        return null;
    }
  }

  private createTeamModel(teamData: {}, teamId: string): Team {
    const teammates: Array<User> = Object.values(teamData[teamId]).map(
      (teammate: string) => <User>{ loginId: teammate, role: UserRole.Student }
    );

    return new Team({ id: teamId, teamMembers: teammates });
  }

  /**
   * To be used to parse the JSON data containing data pertaining to the user role.
   *
   * @return NULL if user is unauthorized, meaning that no role is specified for the user.
   *         else the the role with the highest access rights will be returned.
   */
  private parseUserRole(data: {}, userLoginId: string): UserRole {
    let userRole: UserRole;
    if (data[DataService.ROLES][DataService.STUDENTS] && data[DataService.ROLES][DataService.STUDENTS][[userLoginId]]) {
      userRole = UserRole.Student;
    }
    if (data[DataService.ROLES][DataService.TUTORS] && data[DataService.ROLES][DataService.TUTORS][[userLoginId]]) {
      userRole = UserRole.Tutor;
    }
    if (data[DataService.ROLES][DataService.ADMINS] && data[DataService.ROLES][DataService.ADMINS][[userLoginId]]) {
      userRole = UserRole.Admin;
    }
    return userRole;
  }
}
