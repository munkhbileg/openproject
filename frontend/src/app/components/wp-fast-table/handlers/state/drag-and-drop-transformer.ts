import {Injector} from '@angular/core';
import {WorkPackageTable} from '../../wp-fast-table';
import {TableState} from 'core-components/wp-table/table-state/table-state';
import {States} from 'core-components/states.service';
import {PathHelperService} from "core-app/modules/common/path-helper/path-helper.service";
import {DragAndDropService} from "core-app/modules/boards/drag-and-drop/drag-and-drop.service";
import {RenderedRow, RowRenderInfo} from "core-components/wp-fast-table/builders/primary-render-pass";
import {take, takeUntil} from "rxjs/operators";
import {WorkPackageInlineCreateService} from "core-components/wp-inline-create/wp-inline-create.service";
import {WorkPackageTableRefreshService} from "core-components/wp-table/wp-table-refresh-request.service";

export class DragAndDropTransformer {

  private readonly tableState:TableState = this.injector.get(TableState);
  private readonly states:States = this.injector.get(States);
  private readonly pathHelper = this.injector.get(PathHelperService);
  private readonly dragService = this.injector.get(DragAndDropService, null);
  private readonly inlineCreateService = this.injector.get(WorkPackageInlineCreateService);
  private readonly wpTableRefresh = this.injector.get(WorkPackageTableRefreshService);

  constructor(public readonly injector:Injector,
              public table:WorkPackageTable) {

    // The DragService may not have been provided
    // in which case we do not provide drag and drop
    if (this.dragService === null) {
      return;
    }

    this.inlineCreateService.newInlineWorkPackageCreated
      .pipe(takeUntil(this.tableState.stopAllSubscriptions))
      .subscribe((wpId) => {
        this.tableState.rendered.doModify((rows) => {
          // New index can be taken from rowIndex - 1 (first row is thead>tr)
          const insert:RenderedRow = {hidden: false, classIdentifier: `wp-row-${wpId}`, workPackageId: wpId};
          return [...rows, insert];
        });

        this.updateQuery();
      });

    this.tableState.stopAllSubscriptions
      .pipe(take(1))
      .subscribe(() => {
        this.dragService.remove(this.table.tbody);
      });

    this.dragService.register({
      container: this.table.tbody,
      moves: function(el:any, source:any, handle:HTMLElement, sibling:any) {
        console.warn("Moves %O", el);
        return handle.classList.contains('wp-table--drag-and-drop-handle');
      },
      onMoved: (row:HTMLTableRowElement, target:any, source:HTMLTableRowElement, sibling:HTMLTableRowElement | null) => {
        this.tableState.rendered.doModify((rows) => {
          let fromIndex = rows.findIndex((el) => el.classIdentifier === row.dataset.classIdentifier);
          // New index can be taken from rowIndex - 1 (first row is thead>tr)
          let toIndex = row.rowIndex - 1;
          let target = rows.splice(fromIndex, 1)[0];
          rows.splice(toIndex, 0, target);
          return rows;
        });

        this.updateQuery();
      },
      onRemoved: (row:HTMLTableRowElement, target:any, source:HTMLTableRowElement, sibling:HTMLTableRowElement | null) => {
        console.warn("Removing " + row.dataset.classIdentifier);
        console.warn(this.tableState.rendered.value);
        this.tableState.rendered.doModify((rows) => {
            _.remove(rows, (el) => el.classIdentifier === row.dataset.classIdentifier)
            return rows;
          }
        );
        this.updateQuery();
      },
      onAdded: (row:HTMLTableRowElement, target:any, source:HTMLTableRowElement, sibling:HTMLTableRowElement | null) => {
        const wpId = row.dataset.workPackageId as string;
        const insert:RenderedRow = {hidden: false, classIdentifier: row.dataset.classIdentifier!, workPackageId: wpId};

        this.tableState.rendered.doModify((rows) => {
          // New index can be taken from rowIndex - 1 (first row is thead>tr)
          rows.splice(row.rowIndex - 1, 0, insert);
          return rows;
        });

        this.updateQuery();
      }
    });
  }

  private updateQuery() {
    const query = this.tableState.query.value;
    if (query && !!query.updateImmediately) {
      const orderedWorkPackages = this.tableState.rendered.value!
        .filter((el) => !!el.workPackageId)
        .map(el => this.pathHelper.api.v3.work_packages.id(el.workPackageId!).toString());

      query
        .updateImmediately({orderedWorkPackages: orderedWorkPackages})
        .then(() => {
          this.wpTableRefresh.request("Order changed");
        });
    }
  }
}