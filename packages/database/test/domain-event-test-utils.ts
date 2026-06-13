import type { DomainEventTx } from '../src/domain-events';

type InsertedRow = Record<string, unknown>;

class FakeInsertStep {
  constructor(private readonly capture: { row?: InsertedRow }) {}

  values(row: InsertedRow) {
    this.capture.row = row;
    return { returning: () => [{ id: row.id }] };
  }
}

class FakeTx {
  constructor(private readonly capture: { row?: InsertedRow }) {}

  insert() {
    return new FakeInsertStep(this.capture);
  }
}

export function makeEventTx() {
  const capture: { row?: InsertedRow } = {};
  return { capture, tx: new FakeTx(capture) as unknown as DomainEventTx };
}
