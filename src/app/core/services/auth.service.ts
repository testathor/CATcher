import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { NgZone } from '@angular/core';
import { ElectronService } from './electron.service';
import { UserService } from './user.service';
import { PhaseService } from './phase.service';
import { ErrorHandlingService } from './error-handling.service';
import { GithubService } from './github.service';
import { IssueService } from './issue.service';
import { DataService } from './data.service';
import { LabelService } from './label.service';
import { Title } from '@angular/platform-browser';
import { GithubEventService } from './githubevent.service';
import { generateSessionId } from '../../shared/lib/session';
import { AppConfig } from '../../../environments/environment';
import { LoggingService } from './logging.service';
import { uuid } from '../../shared/lib/uuid';

export enum AuthState { 'NotAuthenticated', 'AwaitingAuthentication', 'ConfirmOAuthUser', 'Authenticated'}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  authStateSource = new BehaviorSubject(AuthState.NotAuthenticated);
  currentAuthState = this.authStateSource.asObservable();
  accessToken = new BehaviorSubject(undefined);
  private state: string;

  ENABLE_POPUP_MESSAGE = 'Please enable pop-ups in your browser';

  constructor(private electronService: ElectronService, private router: Router, private ngZone: NgZone,
              private http: HttpClient,  private errorHandlingService: ErrorHandlingService,
              private githubService: GithubService,
              private userService: UserService,
              private issueService: IssueService,
              private phaseService: PhaseService,
              private labelService: LabelService,
              private dataService: DataService,
              private githubEventService: GithubEventService,
              private titleService: Title,
              private logger: LoggingService) {}

  /**
   * Will store the OAuth token.
   */
  storeOAuthAccessToken(token: string) {
    this.githubService.storeOAuthAccessToken(token);
    this.accessToken.next(token);
  }

  reset(): void {
    this.accessToken.next(undefined);
    this.changeAuthState(AuthState.NotAuthenticated);
    this.ngZone.run(() => this.router.navigate(['']));
  }

  logOut(): void {
    this.githubService.reset();
    this.userService.reset();
    this.issueService.reset(true);
    this.phaseService.reset();
    this.dataService.reset();
    this.githubEventService.reset();
    this.logger.reset();
    this.setLandingPageTitle();
    this.issueService.setIssueTeamFilter('All Teams');
    this.reset();
  }

  setTitleWithPhaseDetail(): void {
    const appSetting = require('../../../../package.json');
    const title = `${appSetting.name} ${appSetting.version} - ${this.phaseService.getPhaseDetail()}`;
    this.titleService.setTitle(title);
  }

  setLandingPageTitle(): void {
    const appSetting = require('../../../../package.json');
    const title = `${appSetting.name} ${appSetting.version}`;
    this.titleService.setTitle(title);
  }

  isAuthenticated(): boolean {
    return this.authStateSource.getValue() === AuthState.Authenticated;
  }

  changeAuthState(newAuthState: AuthState) {
    if (newAuthState === AuthState.Authenticated) {
      const sessionId = generateSessionId();
      this.issueService.setSessionId(sessionId);
      this.logger.info(`Successfully authenticated with session: ${sessionId}`);
    }
    this.authStateSource.next(newAuthState);
  }

  /**
   * Generates and assigns an unguessable random 'state' string to pass to Github for protection against cross-site request forgery attacks
   */
  generateStateString() {
    this.state = uuid();
    sessionStorage.setItem('state', this.state);
  }

  isReturnedStateSame(returnedState: string): boolean {
    const state = sessionStorage.getItem('state');
    return returnedState === state;
  }

  /**
   * Will start the Github OAuth web flow process.
   */
  startOAuthProcess() {
    this.logger.info('Starting authentication');
    const githubRepoPermission = this.phaseService.githubRepoPermissionLevel();
    this.changeAuthState(AuthState.AwaitingAuthentication);

    if (this.electronService.isElectron()) {
      this.electronService.sendIpcMessage('github-oauth', githubRepoPermission);
    } else {
      this.generateStateString();
      this.redirectToOAuthPage(encodeURI(
        `${AppConfig.githubUrl}/login/oauth/authorize?client_id=${AppConfig.clientId}&scope=${githubRepoPermission},read:user&state=${this.state}`
      ));
      this.logger.info('Redirecting for Github authentication');
    }
  }

  /**
   * Will redirect to GitHub OAuth page
   */
  private redirectToOAuthPage(url: string): void {
    if (url == null) {
      return;
    }
    window.location.href = url;
  }
}
