import { DataFile } from '../../src/app/core/models/data-file.model';
import { Team } from '../../src/app/core/models/team.model';
import { UserRole } from '../../src/app/core/models/user.model';

export const csvString =
  `
role,name,team
student,JunWei96,CS2103T-W12-3
admin,damithc,
tutor,anubh-v,CS2103T-W12-3
admin,geshuming,

tutor,jj-lim,CS2103T-W12-3
tutor,jj-lim,CS2103T-W12-3
tutor,jj-lim,CS2103T-W12-4
tutor,q     ,CS2103T-W12-4
student,003-samuel,CS2103T-W12-3
student,damithc,CS2103T-W12-3
student,RonakLakhotia,CS2103T-W12-4
student,ptvrajsk,CS2103T-W12-3` + `                       `;

// jsonData is a json representation of csvString
export const jsonData = {
  roles: {
    students: {
      junwei96: 'true',
      '003-samuel': 'true',
      damithc: 'true',
      ronaklakhotia: 'true',
      ptvrajsk: 'true'
    },
    tutors: { 'anubh-v': 'true', 'jj-lim': 'true', q: 'true' },
    admins: { damithc: 'true', geshuming: 'true' }
  },
  'team-structure': {
    'CS2103T-W12-3': {
      junwei96: 'JunWei96',
      '003-samuel': '003-samuel',
      damithc: 'damithc',
      ptvrajsk: 'ptvrajsk'
    },
    'CS2103T-W12-4': { ronaklakhotia: 'RonakLakhotia' }
  },
  'students-allocation': {
    junwei96: { teamId: 'CS2103T-W12-3' },
    '003-samuel': { teamId: 'CS2103T-W12-3' },
    damithc: { teamId: 'CS2103T-W12-3' },
    ronaklakhotia: { teamId: 'CS2103T-W12-4' },
    ptvrajsk: { teamId: 'CS2103T-W12-3' }
  },
  'tutors-allocation': {
    'anubh-v': { 'CS2103T-W12-3': 'true' },
    'jj-lim': { 'CS2103T-W12-3': 'true', 'CS2103T-W12-4': 'true' },
    q: { 'CS2103T-W12-4': 'true' }
  },
  'admins-allocation': { damithc: {}, geshuming: {} }
};

// These are objects representing some users and teams in jsonData
export const TEAM_3 = new Team({
  id: 'CS2103T-W12-3',
  teamMembers: [
    { loginId: 'JunWei96', role: UserRole.Student },
    { loginId: '003-samuel', role: UserRole.Student },
    { loginId: 'damithc', role: UserRole.Student },
    { loginId: 'ptvrajsk', role: UserRole.Student }
  ]
});

export const TEAM_4 = new Team({
  id: 'CS2103T-W12-4',
  teamMembers: [{ loginId: 'RonakLakhotia', role: UserRole.Student }]
});

export const USER_JUNWEI = {
  loginId: 'JunWei96',
  role: UserRole.Student,
  team: TEAM_3
};

export const USER_ANUBHAV = {
  loginId: 'anubh-v',
  role: UserRole.Student,
  team: TEAM_3
};

export const USER_Q = {
  loginId: 'q',
  role: UserRole.Tutor,
  allocatedTeams: [TEAM_4]
};

export const USER_SHUMING = {
  loginId: 'geshuming',
  role: UserRole.Admin,
  allocatedTeams: []
};

export const USER_WITH_TWO_ROLES = {
  loginId: 'damithc',
  role: UserRole.Admin,
  allocatedTeams: []
};

export const dataFileTeamStructure: DataFile = {
  teamStructure: new Map<string, Team>([
    [
      'CS2103T-W12-3',
      new Team({
        id: 'CS2103T-W12-3',
        teamMembers: [
          { loginId: 'JunWei96', role: UserRole.Student },
          { loginId: '003-samuel', role: UserRole.Student },
          { loginId: 'damithc', role: UserRole.Student },
          { loginId: 'ptvrajsk', role: UserRole.Student }
        ]
      })
    ],
    ['CS2103T-W12-4', new Team({ id: 'CS2103T-W12-4', teamMembers: [{ loginId: 'RonakLakhotia', role: UserRole.Student }] })]
  ])
};
