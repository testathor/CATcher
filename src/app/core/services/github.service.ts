import { Injectable } from '@angular/core';
import { catchError, filter, flatMap, map, throwIfEmpty } from 'rxjs/operators';
import { forkJoin, from, Observable, of, throwError } from 'rxjs';
import { getNumberOfPages } from '../../shared/lib/github-paginator-parser';
import { IssueComment } from '../models/comment.model';
import { ERRORCODE_NOT_FOUND, ErrorHandlingService } from './error-handling.service';
import { GithubUser } from '../models/github-user.model';
import { GithubIssue } from '../models/github/github-issue.model';
import { GithubComment } from '../models/github/github-comment.model';
import { GithubRelease } from '../models/github/github.release';
import { GithubResponse } from '../models/github/github-response.model';
import { IssuesCacheManager } from '../models/github/cache-manager/issues-cache-manager.model';
import { IssueLastModifiedManagerModel } from '../models/github/cache-manager/issue-last-modified-manager.model';
import { Apollo, QueryRef } from 'apollo-angular';
import {
  FetchIssue,
  FetchIssueQuery, FetchIssues, FetchIssuesByTeam, FetchIssuesByTeamQuery, FetchIssuesQuery,
} from '../../../../graphql/graphql-types';
import { GithubGraphqlIssue } from '../models/github/github-graphql.issue';
import { ApolloQueryResult } from 'apollo-client';
import { HttpErrorResponse } from '@angular/common/http';
import RestGithubIssueFilter from '../models/github/github-issue-filter.model';
import { DocumentNode } from 'graphql';
import { ElectronService } from './electron.service';
import { SessionData } from '../models/session.model';
import { AppConfig } from '../../../environments/environment';

const Octokit = require('@octokit/rest');
const CATCHER_ORG = 'CATcher-org';
const CATCHER_REPO = 'CATcher';
const UNABLE_TO_OPEN_IN_BROWSER = 'Unable to open this issue in Browser';

let ORG_NAME = '';
let MOD_ORG = '';
let REPO = '';
let DATA_REPO = '';
let octokit = new Octokit();

@Injectable({
  providedIn: 'root',
})

/**
 * Responsible for communicating with GitHub to create, update, read and delete
 * issues using GitHub API Requests.
 */
export class GithubService {
  private static readonly IF_NONE_MATCH_EMPTY = { 'If-None-Match': '' };

  private issuesCacheManager = new IssuesCacheManager();
  private issuesLastModifiedManager = new IssueLastModifiedManagerModel();
  private issueQueryRefs = new Map<Number, QueryRef<FetchIssueQuery>>();

  constructor(
    private errorHandlingService: ErrorHandlingService,
    private apollo: Apollo,
    private electronService: ElectronService,
  ) {}

  storeOAuthAccessToken(accessToken: string) {
    octokit = new Octokit({
      auth() {
        return `Token ${accessToken}`;
      }
    });
  }

  storeOrganizationDetails(orgName: string, dataRepo: string) {
    MOD_ORG = orgName;
    DATA_REPO = dataRepo;
  }

  storePhaseDetails(phaseRepoOwner: string, repoName: string) {
    REPO = repoName;
    ORG_NAME = phaseRepoOwner;
  }

  fetchIssuesGraphqlByTeam(tutorial: string, team: string, issuesFilter: RestGithubIssueFilter): Observable<Array<GithubIssue>> {
    const graphqlFilter = issuesFilter.convertToGraphqlFilter();
    return this.toFetchIssues(issuesFilter).pipe(
      filter(toFetch => toFetch),
      flatMap(() => {
        return this.fetchGraphqlList<FetchIssuesByTeamQuery, GithubGraphqlIssue>(
          FetchIssuesByTeam,
          { owner: ORG_NAME, name: REPO, filter: {
              ...graphqlFilter,
              labels: [...(graphqlFilter.labels ? graphqlFilter.labels : []), team]
            }, tutorial },
          (result) => result.data.repository.label.issues.edges,
          GithubGraphqlIssue
        );
      })
    );
  }

  fetchIssuesGraphql(issuesFilter: RestGithubIssueFilter): Observable<Array<GithubIssue>> {
    const graphqlFilter = issuesFilter.convertToGraphqlFilter();
    return this.toFetchIssues(issuesFilter).pipe(
      filter(toFetch => toFetch),
      flatMap(() => {
        return this.fetchGraphqlList<FetchIssuesQuery, GithubGraphqlIssue>(
          FetchIssues,
          { owner: ORG_NAME, name: REPO, filter: graphqlFilter },
          (result) => result.data.repository.issues.edges,
          GithubGraphqlIssue
        );
      })
    );
  }

  /**
   * Will make multiple request to Github as per necessary and determine whether a graphql fetch is required.
   */
  private toFetchIssues(filter: RestGithubIssueFilter): Observable<boolean> {
    let responseInFirstPage: GithubResponse<GithubIssue[]>;
    return this.getIssuesAPICall(filter, 1).pipe(
      map((response: GithubResponse<GithubIssue[]>) => {
        responseInFirstPage = response;
        return getNumberOfPages(response);
      }),
      flatMap((numOfPages: number) => {
        const apiCalls: Observable<GithubResponse<GithubIssue[]>>[] = [];
        for (let i = 2; i <= numOfPages; i++) {
          apiCalls.push(this.getIssuesAPICall(filter, i));
        }
        return apiCalls.length === 0 ? of([]) : forkJoin(apiCalls);
      }),
      map((resultArray: GithubResponse<GithubIssue[]>[]) => {
        const responses = [responseInFirstPage, ...resultArray];
        const isCached = responses.reduce((result, response) => {
          return result && response.isCached;
        }, true);
        responses.forEach((resp, index) => this.issuesCacheManager.set(index + 1, resp));
        return !isCached;
      }));
  }

  /**
   * Checks if the specified repository exists.
   * @param owner - Owner of Specified Repository.
   * @param repo - Name of Repository.
   */
  isRepositoryPresent(owner: string, repo: string): Observable<boolean> {
    return from(octokit.repos.get({owner: owner, repo: repo, headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
      map((rawData: {status: number}) => {
        return rawData.status !== ERRORCODE_NOT_FOUND;
      }),
      catchError(err => {
        return of(false);
      }),
      catchError(err => throwError('Failed to fetch repo data.'))
    );
  }

  /**
   * Creates a repository in for the authenticated user location.
   * @param name - Name of Repo to create.
   * @return Observable<boolean> - That returns true if the repository has been successfully
   *                                created.
   */
  createRepository(name: string): void {
    octokit.repos.createForAuthenticatedUser({name: name});
  }

  fetchIssueGraphql(id: number): Observable<GithubGraphqlIssue> {
    if (this.issueQueryRefs.get(id) === undefined) {
      const newQueryRef = this.apollo.watchQuery<FetchIssueQuery>({
        query: FetchIssue,
        variables: {
          owner: ORG_NAME,
          name: REPO,
          issueId: id,
        }
      });
      this.issueQueryRefs.set(id, newQueryRef);
    }

    const queryRef = this.issueQueryRefs.get(id);
    return this.toFetchIssue(id).pipe(
      filter(toFetch => toFetch),
      flatMap(() => from(queryRef.refetch())),
      map((value: ApolloQueryResult<FetchIssueQuery>) => {
        return new GithubGraphqlIssue(value.data.repository.issue);
      }),
      throwIfEmpty(() => new HttpErrorResponse({ status: 304 }))
    );
  }

  toFetchIssue(id: number): Observable<boolean> {
    return from(octokit.issues.get({owner: ORG_NAME, repo: REPO, issue_number: id,
      headers: { 'If-Modified-Since': this.issuesLastModifiedManager.get(id) }})).pipe(
      map((response: GithubResponse<GithubIssue>) => {
        this.issuesLastModifiedManager.set(id, response.headers['last-modified']);
        return true;
      }),
      catchError(err => throwError('Failed to fetch issue.'))
    );
  }

  fetchAllLabels(): Observable<Array<{}>> {
    return from(octokit.issues.listLabelsForRepo({owner: ORG_NAME, repo: REPO, headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
      map(response => {
        return response['data'];
      }),
      catchError(err => throwError('Failed to fetch labels.'))
    );
  }

  /**
   * Creates a label in the current repository.
   * @param formattedLabelName - name of new label.
   * @param labelColor - colour of new label.
   */
  createLabel(formattedLabelName: string, labelColor: string): void {
    octokit.issues.createLabel({owner: ORG_NAME, repo: REPO, name: formattedLabelName, color: labelColor});
  }

  /**
   * Updates a label's information in the current repository.
   * @param labelName - name of existing label
   * @param labelColor - new color to be assigned to existing label.
   */
  updateLabel(labelName: string, labelColor: string): void {
    octokit.issues.updateLabel({owner: ORG_NAME, repo: REPO, name: labelName, current_name: labelName, color: labelColor});
  }

  closeIssue(id: number): Observable<GithubIssue> {
    return from(octokit.issues.update({owner: ORG_NAME, repo: REPO, issue_number: id, state: 'closed'})).pipe(
      map((response: GithubResponse<GithubIssue>) => {
        this.issuesLastModifiedManager.set(id, response.headers['last-modified']);
        return new GithubIssue(response.data);
      })
    );
  }

  createIssue(title: string, description: string, labels: string[]): Observable<GithubIssue> {
    return from(octokit.issues.create({owner: ORG_NAME, repo: REPO, title: title, body: description, labels: labels})).pipe(
      map((response: GithubResponse<GithubIssue>) => {
        return new GithubIssue(response.data);
      })
    );
  }

  createIssueComment(issueId: number, description: string): Observable<GithubComment> {
    return from(octokit.issues.createComment({owner: ORG_NAME, repo: REPO, issue_number: issueId,
      body: description})).pipe(
      map((response: GithubResponse<GithubComment>) => {
        return response.data;
      })
    );
  }

  updateIssue(id: number, title: string, description: string, labels: string[], assignees?: string[]): Observable<GithubIssue> {
    return from(octokit.issues.update({owner: ORG_NAME, repo: REPO, issue_number: id, title: title, body: description, labels: labels,
      assignees: assignees})).pipe(
      map((response: GithubResponse<GithubIssue>) => {
        this.issuesLastModifiedManager.set(id, response.headers['last-modified']);
        return new GithubIssue(response.data);
      }),
      catchError(err => {
        return throwError(err);
      })
    );
  }

  updateIssueComment(issueComment: IssueComment): Observable<GithubComment> {
    return from(octokit.issues.updateComment({owner: ORG_NAME, repo: REPO, comment_id: issueComment.id,
      body: issueComment.description})).pipe(
      map((response: GithubResponse<GithubComment>) => {
        return response.data;
      })
    );
  }

  uploadFile(filename: string, base64String: string): Observable<any> {
    return from(octokit.repos.createOrUpdateFile({owner: ORG_NAME, repo: REPO, path: `files/${filename}`,
      message: 'upload file', content: base64String}));
  }

  fetchEventsForRepo(): Observable<any[]> {
    return from(octokit.issues.listEventsForRepo({owner: ORG_NAME, repo: REPO, headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
      map(response => {
        return response['data'];
      }),
      catchError(err => throwError('Failed to fetch events for repo.'))
    );
  }

  fetchDataFile(): Observable<{}> {
    return from(octokit.repos.getContents({owner: MOD_ORG, repo: DATA_REPO, path: 'data.csv',
      headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
        map(rawData => {
          return {data: atob(rawData['data']['content'])};
        }),
      catchError(err => throwError('Failed to fetch data file.'))
    );
  }

  fetchLatestRelease(): Observable<GithubRelease> {
    return from(octokit.repos.getLatestRelease({owner: CATCHER_ORG, repo: CATCHER_REPO, headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
      map(res => res['data']),
      catchError(err => throwError('Failed to fetch latest release.'))
    );
  }

  /**
   * Fetches the data file that is regulates session information.
   * @return Observable<SessionData> representing session information.
   */
  fetchSettingsFile(): Observable<SessionData> {
    return from(octokit.repos.getContents({owner: MOD_ORG, repo: DATA_REPO, path: 'settings.json',
      headers: GithubService.IF_NONE_MATCH_EMPTY})).pipe(
        map(rawData => JSON.parse(atob(rawData['data']['content']))),
      catchError(err => throwError('Failed to fetch settings file.'))
    );
  }

  fetchAuthenticatedUser(): Observable<GithubUser> {
    return from(octokit.users.getAuthenticated()).pipe(
      map(response => {
        return response['data'];
      }),
      catchError(err => throwError('Failed to fetch authenticated user.'))
    );
  }

  getRepoURL(): string {
    return ORG_NAME.concat('/').concat(REPO);
  }

  viewIssueInBrowser(id: number) {
    if (id) {
      this.electronService.openLink('https://github.com/'.concat(this.getRepoURL()).concat('/issues/').concat(String(id)));
    } else {
      this.errorHandlingService.handleError(new Error(UNABLE_TO_OPEN_IN_BROWSER));
    }
    event.stopPropagation();
  }

  reset(): void {
    this.issuesCacheManager.clear();
    this.issuesLastModifiedManager.clear();
    this.issueQueryRefs.clear();
  }

  getProfilesData(): Promise<Response> {
    return fetch(AppConfig.clientDataUrl);
  }

  private getIssuesAPICall(filter: RestGithubIssueFilter, pageNumber: number): Observable<GithubResponse<GithubIssue[]>> {
    const apiCall: Promise<GithubResponse<GithubIssue[]>> = octokit.issues.listForRepo({...filter, owner: ORG_NAME,
      repo: REPO, sort: 'created', direction: 'desc', per_page: 100, page: pageNumber,
      headers: { 'If-None-Match': this.issuesCacheManager.getEtagFor(pageNumber) }});
    const apiCall$ = from(apiCall);
    return apiCall$.pipe(
      catchError(err => {
        return of(this.issuesCacheManager.get(pageNumber));
      })
    );
  }

  private fetchGraphqlList<T, M>(
    query: DocumentNode,
    variables: {},
    pluckEdges: (results: ApolloQueryResult<T>) => Array<any>,
    Model: new (data) => M,
  ): Observable<Array<M>> {
    return from(this.withPagination<T>(pluckEdges)(query, variables)).pipe(
      map((results: Array<ApolloQueryResult<T>>) => {
        const issues = results.reduce((accumulated, current) => accumulated.concat(pluckEdges(current)), []);
        return issues.map(issue => new Model(issue.node));
      }),
      throwIfEmpty(() => {
        return new HttpErrorResponse({ status: 304 });
      })
    );
  }

  private withPagination<T>(pluckEdges: (results: ApolloQueryResult<T>) => Array<any>) {
    return async (
      query: DocumentNode,
      variables: { [key: string]: any } = {}
    ): Promise<Array<ApolloQueryResult<T>>> => {
      const maxResultsCount = 100;
      const cursor = variables.cursor || null;
      const graphqlQuery = this.apollo.watchQuery<T>({ query, variables: { ...variables, cursor } });
      return graphqlQuery.refetch().then(async (results: ApolloQueryResult<T>) => {
        const intermediate = Array.isArray(results) ? results : [results];
        const edges = pluckEdges(results);
        const nextCursor = (edges.length === 0) ? null : edges[edges.length - 1].cursor;

        if (edges.length < maxResultsCount || !nextCursor) {
          return intermediate;
        }
        const nextResults = await this.withPagination<T>(pluckEdges)(
          query, {
            ...variables,
            cursor: nextCursor,
          }
        );
        return intermediate.concat(nextResults);
      });
    };
  }
}
