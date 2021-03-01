import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { IssueService } from '../../core/services/issue.service';
import { Issue, STATUS } from '../../core/models/issue.model';
import { UserService } from '../../core/services/user.service';
import { UserRole } from '../../core/models/user.model';
import { ACTION_BUTTONS, IssueTablesComponent } from '../../shared/issue-tables/issue-tables.component';
import { TABLE_COLUMNS } from '../../shared/issue-tables/issue-tables-columns';

@Component({
  selector: 'app-issues-responded',
  templateUrl: './issues-responded.component.html',
  styleUrls: ['./issues-responded.component.css'],
})
export class IssuesRespondedComponent implements OnInit, OnChanges {
  displayedColumns: string[];
  filter: (issue: Issue) => boolean;

  readonly actionButtons: ACTION_BUTTONS[] = [
    ACTION_BUTTONS.VIEW_IN_WEB,
    ACTION_BUTTONS.MARK_AS_PENDING,
    ACTION_BUTTONS.FIX_ISSUE
  ];

  @Input() teamFilter: string;

  @ViewChild(IssueTablesComponent) table: IssueTablesComponent;

  constructor(public issueService: IssueService, public userService: UserService) {
    if (userService.currentUser.role === UserRole.Student) {
      this.displayedColumns = [
        TABLE_COLUMNS.ID,
        TABLE_COLUMNS.TITLE,
        TABLE_COLUMNS.TYPE,
        TABLE_COLUMNS.SEVERITY,
        TABLE_COLUMNS.RESPONSE,
        TABLE_COLUMNS.ASSIGNEE,
        TABLE_COLUMNS.DUPLICATED_ISSUES,
        TABLE_COLUMNS.ACTIONS
      ];
    } else {
      this.displayedColumns = [
        TABLE_COLUMNS.ID,
        TABLE_COLUMNS.TITLE,
        TABLE_COLUMNS.TEAM_ASSIGNED,
        TABLE_COLUMNS.TYPE,
        TABLE_COLUMNS.SEVERITY,
        TABLE_COLUMNS.RESPONSE,
        TABLE_COLUMNS.ASSIGNEE,
        TABLE_COLUMNS.DUPLICATED_ISSUES,
        TABLE_COLUMNS.ACTIONS
      ];
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes.teamFilter.isFirstChange()) {
      this.table.issues.teamFilter = changes.teamFilter.currentValue;
    }
  }

  ngOnInit() {
    this.filter = (issue: Issue) => {
      const isDuplicateIssue = (issue) => !!issue.duplicateOf;
      const issueIsDone = (issue: Issue) => issue.status === STATUS.Done;
      return this.issueService.hasTeamResponse(issue.id) && !isDuplicateIssue(issue) && issueIsDone(issue);
    };
  }

  applyFilter(filterValue: string) {
    this.table.issues.filter = filterValue;
  }
}
