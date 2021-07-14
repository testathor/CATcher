import { Injectable } from '@angular/core';
import { GithubService } from './github.service';
import { map } from 'rxjs/operators';
import { DataFile } from '../models/data-file.model';
import { Team } from '../models/team.model';
import { User, UserRole } from '../models/user.model';
import { Observable } from 'rxjs';
import { Admins } from '../models/parser/admins.model';
import { Tutors } from '../models/parser/tutors.model';
import { Students } from '../models/parser/students.model';
import { Teams } from '../models/parser/teams.model';
import { Roles } from '../models/parser/roles.model';
import { ParsedUserData } from '../models/parser/parsed-user-data.model';
import { TabulatedUserData } from '../models/parser/tabulated-user-data.model';


@Injectable({
  providedIn: 'root',
})
export class DataService {
  public dataFile: DataFile;

  constructor(private githubService: GithubService) {}

  /**
   * Retrieves the csv file from the settings repo and constructs
   * the required data file for the app.
   */
  getDataFile(): Observable<{}> {
    return this.githubService.fetchDataFile().pipe(
      map((allCsvDataWrapper: {}) => {
        return this.constructData(allCsvDataWrapper);
      }),
      map((jsonData: {}) => {
        this.dataFile = <DataFile>{
          teamStructure: this.extractTeamStructure(jsonData)
        };
        return jsonData;
      })
    );
  }

  /**
   * Merges all parsed Csv Data into a single readable JSON
   * format.
   * @param allCsvDataWrapper - Object containing strings of csv data.
   * @return jsonData - CSV Data Object the tabulated information of the different users
   */
  private constructData(allCsvDataWrapper: {}): TabulatedUserData {
    const jsonData: TabulatedUserData = {};
    const allCsvData: string = allCsvDataWrapper['data'];

    jsonData['roles'] = this.parseRolesData(allCsvData);
    jsonData['team-structure'] = this.parseTeamStructureData(allCsvData);
    jsonData['students-allocation'] = this.parseStudentAllocation(allCsvData);
    jsonData['tutors-allocation'] = this.parseTutorAllocation(allCsvData);
    jsonData['admins-allocation'] = this.parseAdminAllocation(allCsvData);

    return jsonData;
  }

  /**
   * Parses the input string containing admin allocation information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseAdminAllocation(csvInput: string): Admins {
    // CSV Headers
    const NAME = 'name';
    const ROLE = 'role';

    const admins: Admins = {};
    const parsedCSV: ParsedUserData[] = this.parseUsersData(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach(entry => {
      if (entry[ROLE] === UserRole.Admin.toLowerCase()) {
        admins[entry[NAME].toLowerCase()] = {};
      }
    });

    return admins;
  }

  /**
   * Parses the input string containing tutor allocation information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return tutors- object that represents parsed csv data.
   */
  private parseTutorAllocation(csvInput: string): Tutors {
    // CSV Headers
    const NAME = 'name';
    const TEAM = 'team';
    const ROLE = 'role';

    const tutors: Tutors = {};
    const parsedCSV: ParsedUserData[] = this.parseUsersData(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach(entry => {
      if (!(entry[ROLE] === UserRole.Tutor.toLowerCase())) {
        return;
      }
      const tutor = entry[NAME].toLowerCase() in tutors ? tutors[entry[NAME].toLowerCase()] : {};
      tutor[entry[TEAM]] = 'true';
      tutors[entry[NAME].toLowerCase()] = tutor;
    });

    return tutors;
  }

  /**
   * Parses the input string containing student allocation information
   * into a Studens Object
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data about the students' team allocation
   */
  private parseStudentAllocation(csvInput: string): Students {
    // CSV Headers
    const TEAM = 'team';
    const NAME = 'name';
    const ROLE = 'role';
    // Team Notation
    const TEAM_ID = 'teamId';

    const students: Students = {};
    const parsedCSV: ParsedUserData[] = this.parseUsersData(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach(entry => {
      if (!(entry[ROLE] === UserRole.Student.toLowerCase())) {
        return;
      }
      const newStudent = {};
      newStudent[TEAM_ID] = entry[TEAM];
      students[entry[NAME].toLowerCase()] = newStudent;
    });

    return students;
  }

  /**
   * Parses the input string containing team structure information
   * into a Teams Object
   * @param csvInput - string containing csv data.
   * @return teams - object that represents parsed csv data containing the team structures.
   */
  private parseTeamStructureData(csvInput: string): Teams {
    // CSV Headers
    const TEAM = 'team';
    const NAME = 'name';
    const ROLE = 'role';

    const teams: Teams = {};
    const parsedCSV: ParsedUserData[] = this.parseUsersData(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach(entry => {
      if (!(entry[ROLE] === UserRole.Student.toLowerCase())) {
        return;
      }
      const team = entry[TEAM] in teams ? teams[entry[TEAM]] : {};
      team[entry[NAME].toLowerCase()] = 'true';
      teams[entry[TEAM]] = team;
    });

    return teams;
  }

  /**
   * Parses the input string containing roles information
   * into a Roles object which indicates their allocated roles
   * @param csvInput - string containing csv data.
   * @return roles - object that represents parsed csv data regarding the allocated user roles.
   */
  private parseRolesData(csvInput: string): Roles {
    // CSV Headers
    const ROLE = 'role';
    const NAME = 'name';

    const roles: Roles = {};
    const students = {};
    const tutors = {};
    const admins = {};
    const parsedCSV: ParsedUserData[] = this.parseUsersData(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach(entry => {
      if (entry[ROLE] === UserRole.Student.toLowerCase()) {
        students[entry[NAME].toLowerCase()] = 'true';
      } else if (entry[ROLE] === UserRole.Tutor.toLowerCase()) {
        tutors[entry[NAME].toLowerCase()] = 'true';
      } else if (entry[ROLE] === UserRole.Admin.toLowerCase()) {
        admins[entry[NAME].toLowerCase()] = 'true';
      }
    });

    roles['students'] = students;
    roles['tutors'] = tutors;
    roles['admins'] = admins;

    return roles;
  }

  /**
   * Converts the input csv information to an array of
   * parsed user data. Each object's values are
   * marked by the respective csv table headers.
   * @param csvText - csv information.
   * @return - Subjects that tracks the parsed data.
   */
  private parseUsersData(csvText: string): ParsedUserData[] {
    const lines = csvText.split('\n').filter(v => v.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const result: ParsedUserData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }
      const lineValues = line.split(',').map(v => v.trim());
      const lineObj: ParsedUserData = {};
      for (let j = 0; j < headers.length; j++) {
        if (!lineValues[j]) {
          lineObj[headers[j]] = null;
        } else {
          lineObj[headers[j]] = lineValues[j];
        }
      }
      result.push(lineObj);
    }

    return result;
  }

  getTeam(teamId: string): Team {
    return this.dataFile.teamStructure.get(teamId);
  }

  getTeams(): string[] {
    return Array.from(this.dataFile.teamStructure.keys());
  }

  // returns a mapping from teamId to their respective team structure.
  private extractTeamStructure(jsonData: {}): Map<string, Team> {
    const teamStructure = new Map<string, Team>();
    const jsonTeamStructure = jsonData['team-structure'];
    const teamIds = Object.keys(jsonTeamStructure);
    for (const teamId of teamIds) {
      const teamMembers = new Array<User>();
      const teamMemberIds = Object.keys(jsonTeamStructure[teamId]);
      for (const teamMemberId of teamMemberIds) {
        teamMembers.push(<User>{loginId: teamMemberId, role: UserRole.Student});
      }
      teamStructure.set(teamId, new Team({id: teamId, teamMembers: teamMembers}));
    }
    return teamStructure;
  }

  reset() {
    this.dataFile = undefined;
  }
}
