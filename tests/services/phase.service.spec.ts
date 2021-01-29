import { of } from 'rxjs';
import { SessionData } from '../../src/app/core/models/session.model';
import { User, UserRole } from '../../src/app/core/models/user.model';
import { Phase, PhaseService } from '../../src/app/core/services/phase.service';
import { UserService } from '../../src/app/core/services/user.service';

const testStudent: User  = {
  loginId: 'testStudent',
  role: UserRole.Student
};

const testTutor: User = {
  loginId: 'testTutor',
  role: UserRole.Tutor
};

const mockSettingsFile: {} = {
  'openPhases': [Phase.phaseBugReporting],
  [Phase.phaseBugReporting]: 'bugreporting',
  [Phase.phaseTeamResponse]: 'pe-results',
  [Phase.phaseTesterResponse]: 'testerresponse',
  [Phase.phaseModeration]: 'pe-evaluation'
};

const mockSessionData: SessionData = mockSettingsFile as SessionData;

let phaseService: any;
let githubService: any;
let userService: any;

describe('PhaseService', () => {
    beforeEach(() => {
      githubService = jasmine.createSpyObj('GithubService',
        ['fetchSettingsFile', 'storePhaseDetails', 'createRepository']);
      userService = new UserService(null, null);
      phaseService = new PhaseService(null, githubService, null, userService, null);
    });

    describe('.fetchSessionData()', () => {
      it('should fetch the correct settings file', () => {
        githubService.fetchSettingsFile.and.returnValue(of(mockSettingsFile));
        phaseService.fetchSessionData().subscribe((sessionData: SessionData) => {
          expect(sessionData).toEqual(mockSessionData);
        });
      });
    });

    describe('.updateSessionParameters()', () => {
      it('should update the currentPhase and repoName based on given sessionData', () => {
        githubService.storePhaseDetails.and.callFake(() => {});
        phaseService.updateSessionParameters(mockSessionData);
        expect(phaseService.currentPhase).toEqual(Phase.phaseBugReporting);
        expect(phaseService.repoName).toEqual(mockSettingsFile[Phase.phaseBugReporting]);
      });
    });

    describe('.attemptSessionAvailabilityFix()', () => {
      it('should throw no errors given phaseBugReporting and student role', () => {
        userService.currentUser = testStudent;
        // refresh phaseService with new userService
        phaseService = new PhaseService(null, githubService, null, userService, null);
        githubService.storePhaseDetails.and.callFake(() => {});
        phaseService.updateSessionParameters(mockSessionData);
        githubService.createRepository.and.callFake(() => {});
        expect(() => phaseService.attemptSessionAvailabilityFix(mockSessionData)).not.toThrow();
      });

      it('should throw an error given no openPhases', () => {
        userService.currentUser = testStudent;
        phaseService = new PhaseService(null, githubService, null, userService, null);
        githubService.createRepository.and.callFake(() => {});
        expect(() => phaseService.attemptSessionAvailabilityFix(mockSessionData)).toThrow();
      });

      it('should throw an error given non-student role and phaseBugReporting', () => {
        userService.currentUser = testTutor;
        phaseService = new PhaseService(null, githubService, null, userService, null);
        githubService.storePhaseDetails.and.callFake(() => {});
        phaseService.updateSessionParameters(mockSessionData);
        githubService.createRepository.and.callFake(() => {});
        expect(() => phaseService.attemptSessionAvailabilityFix(mockSessionData)).toThrow();
      });
    });

    describe('.githubRepoPermissionLevel()', () => {
      it('should return "repo" if phaseModeration is included in openPhases', () => {
        githubService.storePhaseDetails.and.callFake(() => {});
        phaseService.sessionData = {
          ...mockSessionData,
          openPhases: [Phase.phaseModeration]
        };
        expect(phaseService.sessionData.openPhases).toContain(Phase.phaseModeration);
        expect(phaseService.githubRepoPermissionLevel()).toEqual('repo');
      });

      it('should return "public_repo" if phaseModeration is not included in openPhases', () => {
        githubService.storePhaseDetails.and.callFake(() => {});
        phaseService.sessionData = {
          ...mockSessionData,
          openPhases: []
        };
        expect(phaseService.sessionData.openPhases).not.toContain(Phase.phaseModeration);
        expect(phaseService.githubRepoPermissionLevel()).toEqual('public_repo');
      });
    });

    describe('.reset()', () => {
      it('should reset the currentPhase of the PhaseService', () => {
        phaseService.currentPhase = Phase.phaseBugReporting;
        phaseService.reset();
        expect(phaseService.currentPhase).toBeNull();
      });
    });
});
