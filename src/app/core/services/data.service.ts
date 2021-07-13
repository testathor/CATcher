import { Injectable } from '@angular/core';
import { GithubService } from './github.service';
import { map } from 'rxjs/operators';
import { DataFile } from '../models/data-file.model';
import { Team } from '../models/team.model';
import { User, UserRole } from '../models/user.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  public static ROLES = 'roles';
  public static TEAM_STRUCTURE  = 'team-structure';
  public static STUDENTS_ALLOCATION = 'students-allocation';
  public static TUTORS_ALLOCATION = 'tutors-allocation';
  public static ADMINS_ALLOCATION = 'admins-allocation';

  // CSV Headers
  public static NAME = 'name';
  public static TEAM = 'team';
  public static ROLE = 'role';

  // Team Notation
  public static TEAM_ID = 'teamId';

  public static STUDENTS = 'students';
  public static TUTORS = 'tutors';
  public static ADMINS = 'admins';

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
   * @return jsonData - Object representing merged data file.
   */
  private constructData(allCsvDataWrapper: {}): {} {
    const jsonData: {} = {};
    const allCsvData: string = allCsvDataWrapper['data'];

    jsonData[DataService.ROLES] = this.parseRolesData(allCsvData);
    jsonData[DataService.TEAM_STRUCTURE] = this.parseTeamStructureData(allCsvData);
    jsonData[DataService.STUDENTS_ALLOCATION] = this.parseStudentAllocation(allCsvData);
    jsonData[DataService.TUTORS_ALLOCATION] = this.parseTutorAllocation(allCsvData);
    jsonData[DataService.ADMINS_ALLOCATION] = this.parseAdminAllocation(allCsvData);

    return jsonData;
  }

  /**
   * Parses the input string containing admin allocation information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseAdminAllocation(csvInput: string): {} {
    const admins = {};
    let parsedCSV: {}[];
    parsedCSV = this.csvParser(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach((entry) => {
      if (entry[DataService.ROLE] === UserRole.Admin.toLowerCase()) {
        admins[entry[DataService.NAME].toLowerCase()] = {};
      }
    });

    return admins;
  }

  /**
   * Parses the input string containing tutor allocation information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseTutorAllocation(csvInput: string): {} {
    const tutors = {};
    let parsedCSV: {}[];
    parsedCSV = this.csvParser(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach((entry) => {
      if (!(entry[DataService.ROLE] === UserRole.Tutor.toLowerCase())) {
        return;
      }
      const tutor = entry[DataService.NAME].toLowerCase() in tutors ? tutors[entry[DataService.NAME].toLowerCase()] : {};
      tutor[entry[DataService.TEAM]] = 'true';
      tutors[entry[DataService.NAME].toLowerCase()] = tutor;
    });

    return tutors;
  }

  /**
   * Parses the input string containing student allocation information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseStudentAllocation(csvInput: string): {} {
    const students = {};
    let parsedCSV: {}[];
    parsedCSV = this.csvParser(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach((entry) => {
      if (!(entry[DataService.ROLE] === UserRole.Student.toLowerCase())) {
        return;
      }
      const newStudent = {};
      newStudent[DataService.TEAM_ID] = entry[DataService.TEAM];
      students[entry[DataService.NAME].toLowerCase()] = newStudent;
    });

    return students;
  }

  /**
   * Parses the input string containing team structure information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseTeamStructureData(csvInput: string): {} {
    const teams = {};
    let parsedCSV: {}[];
    parsedCSV = this.csvParser(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach((entry) => {
      if (!(entry[DataService.ROLE] === UserRole.Student.toLowerCase())) {
        return;
      }
      const team = entry[DataService.TEAM] in teams ? teams[entry[DataService.TEAM]] : {};
      team[entry[DataService.NAME].toLowerCase()] = entry[DataService.NAME];
      teams[entry[DataService.TEAM]] = team;
    });

    return teams;
  }

  /**
   * Parses the input string containing roles information
   * into application readable Object.
   * @param csvInput - string containing csv data.
   * @return admins - object that represents parsed csv data.
   */
  private parseRolesData(csvInput: string): {} {
    const roles = {};
    const students = {};
    const tutors = {};
    const admins = {};
    let parsedCSV: {}[];
    parsedCSV = this.csvParser(csvInput);

    // Formats the parsed information for easier app reading
    parsedCSV.forEach((entry) => {
      if (entry[DataService.ROLE] === UserRole.Student.toLowerCase()) {
        students[entry[DataService.NAME].toLowerCase()] = 'true';
      } else if (entry[DataService.ROLE] === UserRole.Tutor.toLowerCase()) {
        tutors[entry[DataService.NAME].toLowerCase()] = 'true';
      } else if (entry[DataService.ROLE] === UserRole.Admin.toLowerCase()) {
        admins[entry[DataService.NAME].toLowerCase()] = 'true';
      }
    });

    roles[DataService.STUDENTS] = students;
    roles[DataService.TUTORS] = tutors;
    roles[DataService.ADMINS] = admins;

    return roles;
  }

  /**
   * Converts the input csv information to an array of
   * objects syncrhonously. Each object's values are
   * marked by the respective csv table headers.
   * @param csvText - csv information.
   * @return - Subjects that tracks the parsed data.
   */
  private csvParser(csvText: string): {}[] {
    const lines = csvText.split('\n').filter((v) => v.trim());
    const headers = lines[0].split(',').map((h) => h.trim());
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }
      const lineValues = line.split(',').map((v) => v.trim());
      const lineObj = {};
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
    const jsonTeamStructure = jsonData[DataService.TEAM_STRUCTURE];
    const teamIds = Object.keys(jsonTeamStructure);

    teamIds.forEach((teamId: string) => {
      const teamMemberIds = Object.values(jsonTeamStructure[teamId]);
      const teamMembers: Array<User> = teamMemberIds.map((teamMemberId: string) => <User>{ loginId: teamMemberId, role: UserRole.Student });

      teamStructure.set(teamId, new Team({ id: teamId, teamMembers: teamMembers }));
    });

    return teamStructure;
  }

  reset() {
    this.dataFile = undefined;
  }
}
