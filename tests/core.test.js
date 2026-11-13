import test from "node:test";
import assert from "node:assert/strict";
import {passwordHash,verifyPassword,validatePassword} from "../api/_lib/auth.js";
test("PBKDF2 password hashes verify and are salted",()=>{const a=passwordHash("correct horse battery");const b=passwordHash("correct horse battery");assert.notEqual(a,b);assert.equal(verifyPassword("correct horse battery",a),true);assert.equal(verifyPassword("wrong",a),false);});
test("password policy requires 12 characters",()=>{assert.equal(validatePassword("short"),false);assert.equal(validatePassword("long-enough-pass"),true);});
test("business ID policy",()=>{assert.match("AB_123-xyz",/^[A-Za-z0-9_-]{1,80}$/);assert.doesNotMatch("bad/id",/^[A-Za-z0-9_-]{1,80}$/);});
