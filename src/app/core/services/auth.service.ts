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

/**
 * Responsible for initiating the authentication process and querying or
 * updating the application state with regards to authentication.
 */
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
  }

  isReturnedStateSame(returnedState: string): boolean {
    return returnedState === this.state;
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
      this.createOauthWindow(encodeURI(
        `${AppConfig.githubUrl}/login/oauth/authorize?client_id=${AppConfig.clientId}&scope=${githubRepoPermission},read:user&state=${this.state}`
      ));
      this.logger.info('Opening window for Github authentication');
    }
  }

  /**
   * Will do a poll on whether the given window is closed.
   * If it is closed and user is still not authenticated, change the auth status to not authenticated.
   */
  private confirmWindowClosed(window: Window): void {
    const authService = this;
    const pollTimer = window.setInterval(function() {
      if (window.closed) {
        window.clearInterval(pollTimer);
        if (!authService.accessToken) {
          authService.changeAuthState(AuthState.NotAuthenticated);
        }
      }
    }, 1000);
  }

  /**
   * Will create a web version of oauth window.
   */
  private createOauthWindow(
    url: string,
    width: number = 500,
    height: number = 600,
    left: number = 0,
    top: number = 0
  ): void {
    if (url == null) {
      return;
    }
    const options = `width=${width},height=${height},left=${left},top=${top}`;
    const oauthWindow = window.open(`${url}`, 'Authorization', options);
    const authService = this;

    if (oauthWindow == null) {
      throw new Error(this.ENABLE_POPUP_MESSAGE);
    }

    oauthWindow.addEventListener('unload', () => {
      if (!oauthWindow.closed) {
        // unload event could be triggered when there is a redirection, hence, a confirmation needed.
        authService.confirmWindowClosed(oauthWindow);
      }
    });
  }
}
