import { Injectable } from '@angular/core';
import { GithubService } from './github.service';
import { catchError, exhaustMap, finalize, flatMap, map } from 'rxjs/operators';
import { BehaviorSubject, EMPTY, forkJoin, timer, Observable, of, Subscription } from 'rxjs';
import {
  Issue,
  Issues,
  IssuesFilter, STATUS,
} from '../models/issue.model';
import { UserService } from './user.service';
import { Phase, PhaseService } from './phase.service';
import { IssueCommentService } from './issue-comment.service';
import { PermissionService } from './permission.service';
import { DataService } from './data.service';
import { ErrorHandlingService } from './error-handling.service';
import { IssueDispute } from '../models/issue-dispute.model';
import { GithubIssue } from '../models/github/github-issue.model';
import { GithubComment } from '../models/github/github-comment.model';
import { IssueComment } from '../models/comment.model';
import { GithubLabel } from '../models/github/github-label.model';
import RestGithubIssueFilter from '../models/github/github-issue-filter.model';

@Injectable({
  providedIn: 'root',
})
export class IssueService {
  static readonly POLL_INTERVAL = 5000; // 5 seconds
  readonly MINIMUM_MATCHES = 1;

  issues: Issues;
  issues$: BehaviorSubject<Issue[]>;

  private issueTeamFilter = 'All Teams';
  private issuesPollSubscription: Subscription;
  /** Whether the IssueService is downloading the data from Github*/
  public isLoading = new BehaviorSubject<boolean>(false);

  constructor(private githubService: GithubService,
              private userService: UserService,
              private phaseService: PhaseService,
              private issueCommentService: IssueCommentService,
              private permissionService: PermissionService,
              private errorHandlingService: ErrorHandlingService,
              private dataService: DataService) {
    this.issues$ = new BehaviorSubject(new Array<Issue>());
  }

  startPollIssues() {
    if (this.issuesPollSubscription === undefined) {
      if (this.issues$.getValue().length === 0) {
        this.isLoading.next(true);
      }

      this.issuesPollSubscription = timer(0, IssueService.POLL_INTERVAL).pipe(
        exhaustMap(() => {
          return this.reloadAllIssues().pipe(
            catchError(() => {
              return EMPTY;
            }),
            finalize(() => this.isLoading.next(false))
        );
        }),
      ).subscribe();
    }
  }

  stopPollIssues() {
    if (this.issuesPollSubscription) {
      this.issuesPollSubscription.unsubscribe();
      this.issuesPollSubscription = undefined;
    }
  }

  /**
   * Will constantly poll and update the application's state's with the updated issue.
   *
   * @param issueId - The issue's id to poll for.
   */
  pollIssue(issueId: number): Observable<Issue> {
    return timer(0, IssueService.POLL_INTERVAL).pipe(
      exhaustMap(() => {
        return this.githubService.fetchIssueGraphql(issueId).pipe(
          map((response) => {
            const issue = this.createIssueModel(response);
            this.updateLocalStore(issue);
            return issue;
          }),
          catchError((err) => {
            return this.getIssue(issueId);
          })
        );
      })
    );
  }

  reloadAllIssues() {
    return this.initializeData();
  }

  getIssue(id: number): Observable<Issue> {
    if (this.issues === undefined) {
      return this.getLatestIssue(id);
    } else {
      return of(this.issues[id]);
    }
  }

  getLatestIssue(id: number): Observable<Issue> {
    return this.githubService.fetchIssueGraphql(id).pipe(
      map((response: GithubIssue) => {
        this.createAndSaveIssueModel(response);
        return this.issues[id];
      }),
      catchError((err) => {
        return of(this.issues[id]);
      })
    );
  }

  createIssue(title: string, description: string, severity: string, type: string): Observable<Issue> {
    const labelsArray = [this.createLabel('severity', severity), this.createLabel('type', type)];
    return this.githubService.createIssue(title, description, labelsArray).pipe(
      map((response: GithubIssue) => this.createIssueModel(response))
    );
  }

  updateIssue(issue: Issue): Observable<Issue> {
    const assignees = this.phaseService.currentPhase === Phase.phaseModeration ? [] : issue.assignees;
    return this.githubService.updateIssue(issue.id, issue.title, this.createGithubIssueDescription(issue),
      this.createLabelsForIssue(issue), assignees).pipe(
        map((response: GithubIssue) => {
          response.comments = issue.githubComments;
          return this.createIssueModel(response);
        })
    );
  }

  updateTesterResponse(issue: Issue, issueComment: IssueComment): Observable<Issue> {
    const isTesterResponseExist = this.issues[issue.id].testerResponses;
    const commentApiToCall = isTesterResponseExist ? this.githubService.updateIssueComment(issueComment)
      : this.githubService.createIssueComment(issue.id, issueComment.description);

    const issueClone = issue.clone(this.phaseService.currentPhase);
    issueClone.status = STATUS.Done;

    return forkJoin([commentApiToCall, this.updateIssue(issueClone)]).pipe(
      map((responses) => {
        const [githubComment, issue] = responses;
        issue.updateTesterResponse(githubComment);
        return issue;
      })
    );
  }

  updateTutorResponse(issue: Issue, issueComment: IssueComment): Observable<Issue> {
    return forkJoin([this.githubService.updateIssueComment(issueComment), this.updateIssue(issue)]).pipe(
      map(responses => {
        const [githubComment, issue] = responses;
        issue.updateDispute(githubComment);
        return issue;
      })
    );
  }

  createTutorResponse(issue: Issue, response: string): Observable<Issue> {
    return forkJoin([this.githubService.createIssueComment(issue.id, response), this.updateIssue(issue)]).pipe(
      map(responses => {
        const [githubComment, issue] = responses;
        issue.updateDispute(githubComment);
        return issue;
      })
    );
  }

  /**
   * This function will create a github representation of issue's description. Given the issue model, it will piece together the different
   * attributes to create the github's description.
   *
   */
  private createGithubIssueDescription(issue: Issue): string {
    switch (this.phaseService.currentPhase) {
      case Phase.phaseModeration:
        return `# Issue Description\n${issue.description}\n# Team\'s Response\n${issue.teamResponse}\n ` +
         // `## State the duplicated issue here, if any\n${issue.duplicateOf ? `Duplicate of #${issue.duplicateOf}` : `--`}\n` +
          `# Disputes\n\n${this.getIssueDisputeString(issue.issueDisputes)}\n`;
      default:
        return issue.description;
    }
  }

  private getIssueDisputeString(issueDisputes: IssueDispute[]): string {
    let issueDisputeString = '';
    for (const issueDispute of issueDisputes) {
      issueDisputeString += issueDispute.toString();
    }
    return issueDisputeString;
  }

  deleteIssue(id: number): Observable<Issue> {
    return this.githubService.closeIssue(id).pipe(
      map((response: GithubIssue) => {
        const deletedIssue = this.createIssueModel(response);
        this.deleteFromLocalStore(deletedIssue);
        return deletedIssue;
      })
    );
  }

  /**
   * This function will update the issue's state of the application. This function needs to be called whenever a issue is deleted.
   */
  deleteFromLocalStore(issueToDelete: Issue) {
    const { [issueToDelete.id]: issueToRemove, ...withoutIssueToRemove } = this.issues;
    this.issues = withoutIssueToRemove;
    this.issues$.next(Object.values(this.issues));
  }

  /**
   * This function will update the issue's state of the application. This function needs to be called whenever a issue is added/updated.
   */
  updateLocalStore(issueToUpdate: Issue) {
    this.issues = {
      ...this.issues,
      [issueToUpdate.id]: issueToUpdate,
    };
    this.issues$.next(Object.values(this.issues));
  }

  /**
   * Check whether the issue has been responded in the phase 2/3.
   */
  hasTeamResponse(issueId: number): boolean {
    return !!this.issues[issueId].teamResponse;
  }

  /**
   * Obtain an observable containing an array of issues that are duplicates of the parentIssue.
   */
  getDuplicateIssuesFor(parentIssue: Issue): Observable<Issue[]> {
    return this.issues$.pipe(map((issues) => {
      return issues.filter(issue => {
        return issue.duplicateOf === parentIssue.id;
      });
    }));
  }

  reset() {
    this.issues = undefined;
    this.issues$.next(new Array<Issue>());

    this.stopPollIssues();
    this.isLoading.complete();
    this.isLoading = new BehaviorSubject<boolean>(false);
  }

  private initializeData(): Observable<Issue[]> {
    const issuesAPICallsByFilter: Array<Observable<Array<GithubIssue>>> = [];

    switch (IssuesFilter[this.phaseService.currentPhase][this.userService.currentUser.role]) {
      case 'FILTER_BY_CREATOR':
        issuesAPICallsByFilter.push(
          this.githubService.fetchIssuesGraphql(new RestGithubIssueFilter({ creator: this.userService.currentUser.loginId }))
        );
        break;
      case 'FILTER_BY_TEAM': // Only student has this filter
        issuesAPICallsByFilter.push(
          this.githubService.fetchIssuesGraphqlByTeam(
            this.createLabel('tutorial', this.userService.currentUser.team.tutorialClassId),
            this.createLabel('team', this.userService.currentUser.team.teamId),
            new RestGithubIssueFilter({}))
        );
        break;
      case 'FILTER_BY_TEAM_ASSIGNED': // Only for Tutors and Admins
        const allocatedTeams = this.userService.currentUser.allocatedTeams;
        allocatedTeams.forEach(team => {
          issuesAPICallsByFilter.push(
            this.githubService.fetchIssuesGraphqlByTeam(
              this.createLabel('tutorial', team.tutorialClassId),
              this.createLabel('team', team.teamId),
              new RestGithubIssueFilter({}))
          );
        });
        break;
      case 'NO_FILTER':
        issuesAPICallsByFilter.push(
          this.githubService.fetchIssuesGraphql(new RestGithubIssueFilter({}))
        );
        break;
      case 'NO_ACCESS':
      default:
        return of([]);
    }

    // const issuesAPICallsByFilter = filters.map(filter => this.githubService.fetchIssuesGraphql(filter));
    return forkJoin(issuesAPICallsByFilter).pipe(
      map((issuesByFilter: [][]) => {
        for (const issues of issuesByFilter) {
          for (const issue of issues) {
            this.createAndSaveIssueModel(issue);
          }
        }
        return Object.values(this.issues);
      })
    );
  }

  private createAndSaveIssueModel(githubIssue: GithubIssue): boolean {
    const issue = this.createIssueModel(githubIssue);
    this.updateLocalStore(issue);
    return true;
  }

  /**
   * Given an issue model, create the necessary labels for github.
   */
  private createLabelsForIssue(issue: Issue): string[] {
    const result = [];

    if (this.phaseService.currentPhase !== Phase.phaseBugReporting &&
        this.phaseService.currentPhase !== Phase.phaseTesterResponse) {
      const studentTeam = issue.teamAssigned.id.split('-');
      result.push(this.createLabel('tutorial', `${studentTeam[0]}-${studentTeam[1]}`),
        this.createLabel('team', studentTeam[2]));
    }

    if (issue.severity) {
      result.push(this.createLabel('severity', issue.severity));
    }

    if (issue.type) {
      result.push(this.createLabel('type', issue.type));
    }

    if (issue.responseTag) {
      result.push(this.createLabel('response', issue.responseTag));
    }

    if (issue.duplicated) {
      result.push('duplicate');
    }

    if (issue.status) {
      result.push(this.createLabel('status', issue.status));
    }

    if (issue.pending) {
      if (+issue.pending > 0) {
        result.push(this.createLabel('pending', issue.pending));
      }
    }

    if (issue.unsure) {
      result.push('unsure');
    }

    return result;
  }

  private createLabel(prepend: string, value: string) {
    return `${prepend}.${value}`;
  }

  private extractTeamIdFromGithubIssue(githubIssue: GithubIssue): string {
    return githubIssue.findLabel(GithubLabel.LABELS.tutorial).concat('-').concat(githubIssue.findLabel(GithubLabel.LABELS.team));
  }

  private createIssueModel(githubIssue: GithubIssue): Issue {
    switch (this.phaseService.currentPhase) {
      case Phase.phaseBugReporting:
        return Issue.createPhaseBugReportingIssue(githubIssue);
      case Phase.phaseTeamResponse:
        return Issue.createPhaseTeamResponseIssue(githubIssue,
          this.dataService.getTeam(this.extractTeamIdFromGithubIssue(githubIssue)));
      case Phase.phaseTesterResponse:
        return Issue.createPhaseTesterResponseIssue(githubIssue);
      case Phase.phaseModeration:
        return Issue.createPhaseModerationIssue(githubIssue,
          this.dataService.getTeam(this.extractTeamIdFromGithubIssue(githubIssue)));
      default:
        return;
    }
  }

  parseTeamResponseForTeamResponsePhase(toParse: string): string {
    let teamResponse = '';
    const regex = /# Team's Response[\r\n]*([\S\s]*?)[\r\n]*## Duplicate status \(if any\):/gi;
    const matches = regex.exec(toParse);

    if (matches && matches.length > this.MINIMUM_MATCHES) {
      teamResponse = matches[1].trim();
    }
    return teamResponse;
  }

  parseDuplicateOfForTeamResponsePhase(toParse: string): string {
    let duplicateOf = '';
    const regex = /## Duplicate status \(if any\):[\r\n]*Duplicate of #(.*)/gi;
    const matches = regex.exec(toParse);

    if (matches && matches.length > this.MINIMUM_MATCHES) {
      duplicateOf = matches[1].trim();
    }
    return duplicateOf;
  }

  setIssueTeamFilter(filterValue: string) {
    if (filterValue) {
      this.issueTeamFilter = filterValue;
    }
  }

  getIssueTeamFilter(): string {
    return this.issueTeamFilter;
  }
}
