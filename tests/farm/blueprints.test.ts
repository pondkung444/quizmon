import {test} from "node:test";
import assert from "node:assert/strict";
import {blueprintGate} from "../../src/lib/farm/blueprints.ts";
test("a completed but unplaced school cannot open learning",()=>{for(const status of [null,"draft","building","puzzle","finishing","paused","ready"])assert.equal(blueprintGate(status,2).school,false);assert.equal(blueprintGate("placed",2).school,true);});
test("only hatched owned stages supported by the lesson are eligible",()=>{for(const stage of [null,0,1,5,2.5,NaN])assert.equal(blueprintGate("placed",stage).pet,false);for(const stage of [2,3,4])assert.equal(blueprintGate("placed",stage).pet,true);});
