import {test} from "node:test";
import assert from "node:assert/strict";
import {blueprintGate} from "../../src/lib/farm/blueprints.ts";
import {checkGardenAnswer,validateGardenAnswers} from "../../src/lib/farm/lesson-validation.ts";
test("a completed but unplaced school cannot open learning",()=>{for(const status of [null,"draft","building","puzzle","finishing","paused","ready"])assert.equal(blueprintGate(status,2).school,false);assert.equal(blueprintGate("placed",2).school,true);});
test("only hatched owned stages supported by the lesson are eligible",()=>{for(const stage of [null,0,1,5,2.5,NaN])assert.equal(blueprintGate("placed",stage).pet,false);for(const stage of [2,3,4])assert.equal(blueprintGate("placed",stage).pet,true);});
test("server lesson validation rejects missing, extra, unknown and wrong answers",()=>{for(const value of [null,{},[],["connected"],["connected","shade","near-water","extra"],["connected","shade","unknown"],["gap","shade","near-water"],["connected","pond","near-water"],["connected","shade","block"]])assert.equal(validateGardenAnswers(value).valid,false);});
test("wrong steps provide a matching hint and only full correct answers unlock",()=>{assert.equal(validateGardenAnswers(["connected","entrance","near-water"]).wrongStep,1);assert.equal(validateGardenAnswers(["connected","shade","near-water"]).valid,true);assert.match(checkGardenAnswer(0,"water").hint,/น้ำ/);assert.equal(checkGardenAnswer(-1,"connected").correct,false);assert.equal(checkGardenAnswer(3,"near-water").correct,false);});
