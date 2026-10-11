import ts from 'typescript';
import { unwrap } from './db-access-source.mjs';

// Cohesive syntactic shape checks only; no invocation, mutation or safety decisions.
export const kindName = node => ts.SyntaxKind[node.kind] ?? String(node.kind);

function literalKey(raw) {
  const node = unwrap(raw);
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isNumericLiteral(node)) return undefined;
  const value = Number(node.text);
  return Number.isFinite(value) ? String(value) : undefined;
}

export function propertyKey(name) {
  if (!name || ts.isPrivateIdentifier(name)) return undefined;
  if (ts.isIdentifier(name)) return name.text;
  return literalKey(ts.isComputedPropertyName(name) ? name.expression : name);
}

export function memberKey(node) {
  return ts.isPropertyAccessExpression(node)
    ? propertyKey(node.name)
    : literalKey(node.argumentExpression);
}

// Structural validation only. An accessor, spread, dynamic or duplicate key, or __proto__ rejects
// the whole literal. It does not assume those members are irrelevant.
const shapes = new WeakMap();
export function objectShape(object) {
  if (shapes.has(object)) return shapes.get(object);
  const members = new Map();
  let reason;
  for (const item of object.properties) {
    if (ts.isSpreadAssignment(item)) reason = 'object-spread';
    else if (ts.isGetAccessorDeclaration(item) || ts.isSetAccessorDeclaration(item))
      reason = 'accessor-property';
    else {
      const key = propertyKey(item.name);
      if (key === undefined) reason = 'computed-key';
      else if (key === '__proto__') reason = 'prototype-property';
      else if (members.has(key)) reason = `duplicate-key:${key}`;
      else members.set(key, item);
    }
    if (reason) break;
  }
  const shape = reason ? { reason } : { members };
  shapes.set(object, shape);
  return shape;
}

export function usesThis(fn) {
  let found = false;
  const visit = node => {
    if (found) return;
    if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword)
      found = true;
    else ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return found;
}

// Return statements owned by a function body; nested functions and classes own their returns.
export function ownReturns(body) {
  const found = [];
  const visit = node => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
}
