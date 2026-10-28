// Exact installed scalar operator/transaction bindings for the fixed assignment family.
import ts from 'typescript';
import {
  fail,
  same,
  named,
  parameters,
  sqlTemplate,
} from './db-access-m4-assignment-primitive-ast.mjs';
export function validateAssignmentOperatorLaws(units) {
  for (const suffix of ['cjs', 'js']) {
    const unit = units.get('node_modules/drizzle-orm/sql/expressions/conditions.' + suffix),
      prefix = suffix === 'cjs' ? 'import_sql.' : '';
    const eq = named(unit, 'eq'),
      isNull = named(unit, 'isNull');
    for (const [name, signature] of [
      ['eq', '(left,right)'],
      ['and', '(...unfilteredConditions)'],
      ['or', '(...unfilteredConditions)'],
      ['isNull', '(value)'],
      ['bindIfParam', '(value,column)'],
    ])
      parameters(named(unit, name), unit, signature, name);
    if (eq.body.statements.length !== 1 || isNull.body.statements.length !== 1)
      fail('operator body');
    sqlTemplate(
      eq.body.statements[0].expression,
      unit,
      prefix + 'sql',
      ['left', 'bindIfParam(right,left)'],
      ['', ' = ', '']
    );
    sqlTemplate(
      isNull.body.statements[0].expression,
      unit,
      prefix + 'sql',
      ['value'],
      ['', ' is null']
    );
    same(
      named(unit, 'and').body.getText(unit),
      '{const conditions=unfilteredConditions.filter((c)=>c!==void 0);if(conditions.length===0){return void 0;}if(conditions.length===1){return new ' +
        prefix +
        'SQL(conditions);}return new ' +
        prefix +
        'SQL([new ' +
        prefix +
        'StringChunk("("),' +
        prefix +
        'sql.join(conditions,new ' +
        prefix +
        'StringChunk(" and ")),new ' +
        prefix +
        'StringChunk(")")]);}',
      'conjunction law'
    );
    same(
      named(unit, 'or').body.getText(unit),
      '{const conditions=unfilteredConditions.filter((c)=>c!==void 0);if(conditions.length===0){return void 0;}if(conditions.length===1){return new ' +
        prefix +
        'SQL(conditions);}return new ' +
        prefix +
        'SQL([new ' +
        prefix +
        'StringChunk("("),' +
        prefix +
        'sql.join(conditions,new ' +
        prefix +
        'StringChunk(" or ")),new ' +
        prefix +
        'StringChunk(")")]);}',
      'staff scope disjunction law'
    );
    const bind = named(unit, 'bindIfParam').body.getText(unit);
    const expected =
      suffix === 'cjs'
        ? '{if((0,import_sql.isDriverValueEncoder)(column)&&!(0,import_sql.isSQLWrapper)(value)&&!(0,import_entity.is)(value,import_sql.Param)&&!(0,import_entity.is)(value,import_sql.Placeholder)&&!(0,import_entity.is)(value,import_column.Column)&&!(0,import_entity.is)(value,import_table.Table)&&!(0,import_entity.is)(value,import_sql.View)){return new import_sql.Param(value,column);}return value;}'
        : '{if(isDriverValueEncoder(column)&&!isSQLWrapper(value)&&!is(value,Param)&&!is(value,Placeholder)&&!is(value,Column)&&!is(value,Table)&&!is(value,View)){return new Param(value,column);}return value;}';
    same(bind, expected, 'scalar binding law');
  }
  for (const suffix of ['cjs', 'js']) {
    const session = units.get('node_modules/drizzle-orm/postgres-js/session.' + suffix),
      database = units.get('node_modules/drizzle-orm/pg-core/db.' + suffix);
    const method = (unit, name) => {
      const matches = named(unit, name).members.filter(
        row => ts.isMethodDeclaration(row) && row.name.getText(unit) === 'transaction'
      );
      if (matches.length !== 1) fail('unique data transaction method');
      return matches[0];
    };
    parameters(
      method(database, 'PgDatabase'),
      database,
      '(transaction,config)',
      'PgDatabase.transaction'
    );
    parameters(
      method(session, 'PostgresJsSession'),
      session,
      '(transaction,config)',
      'PostgresJsSession.transaction'
    );
    same(
      method(database, 'PgDatabase').body.getText(database),
      '{return this.session.transaction(transaction,config);}',
      'data database transaction forwarding'
    );
    same(
      method(session, 'PostgresJsSession').body.getText(session),
      '{return this.client.begin(async(client)=>{const session=new PostgresJsSession(client,this.dialect,this.schema,this.options);const tx=new PostgresJsTransaction(this.dialect,session,this.schema);if(config){await tx.setTransaction(config);}return transaction(tx);});}',
      'actual transaction callback tx'
    );
  }
  const nano = units.get('node_modules/nanoid/index.js'),
    generator = named(nano, 'nanoid');
  parameters(generator, nano, '(size = 21)', 'nanoid');
  if (
    generator.parameters.length !== 1 ||
    generator.parameters[0].initializer?.getText(nano) !== '21'
  )
    fail('nanoid fixed default');
  same(
    generator.body.getText(nano),
    "{fillPool((size |= 0)) let id='' for(let i=poolOffset-size;i<poolOffset;i++){id+=scopedUrlAlphabet[pool[i]&63]}return id}",
    'nanoid scalar generator'
  );
  const alphabet = units.get('node_modules/nanoid/url-alphabet/index.js'),
    letters = named(alphabet, 'urlAlphabet');
  if (
    !ts.isStringLiteral(letters) ||
    letters.text.length !== 64 ||
    new Set(letters.text).size !== 64
  )
    fail('nanoid alphabet');
}
