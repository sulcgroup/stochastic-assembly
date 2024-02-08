import * as THREE from "three"

import {RULE_ORDER, strToVec, vecToStr} from "./utils";
import {Vector3} from "three";

export class PolycubeMove {
	// move position
	readonly pos: Vector3;
	// ???
	readonly speciesFit: { color, alignDir }[];
	constructor(position, speciesFit = [null,null,null,null,null,null]) {
		this.pos = position instanceof THREE.Vector3 ? position : strToVec(position);
		this.speciesFit = speciesFit;
	}
	
	clone() {
		return new PolycubeMove(this.pos.clone(), this.speciesFit.map(f=>{
			return f ? {
				'color': f.color,
				'alignDir': f.alignDir.clone()
			} : null;
		}));
	}
	
	transform(t) {
		let v_new = this.pos.clone().applyMatrix4(t).round();
		let k_new = vecToStr(v_new);
		let move_copy = this.clone();
		// this next bit gets a bit... complecated. i'm like 30% sure it works
		// f = face, fidx = index of face
		this.forEachFace((f, fidx)=>{
			// new direction vector of face after applying transformation
			let fidx_newvec = RULE_ORDER[fidx].clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(t)).round();
			// index of new direction vector of face after applying transformation
			let fidx_newvec_idx = RULE_ORDER.indexOf(fidx_newvec);
			if (f){
				let new_align = f.alignDir.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(t)).round();
				move_copy.setFace(fidx_newvec, f.color, new_align);
			}
		})
		return move_copy
	}
	
	/**
	sets color and alignment for a face 
	@param face an int index in RULE_ORDER, or a vector in RULE_ORDER which will be converted to an int index
	@param color new color
	@param alignDir new align dir 
	*/
	setFace(face, color, alignDir)
	{
		if (face instanceof THREE.Vector3){
			face = RULE_ORDER.indexOf(face);
		}
		if (!this.speciesFit[face]){
			this.speciesFit[face] = {
				'color': color,
				'alignDir': alignDir
			}
		}
		else {
			this.speciesFit[face].color = color;
			this.speciesFit[face].alignDir = alignDir;
		}
	}
	
	clearFace(face){
		if (face instanceof THREE.Vector3){
			face = RULE_ORDER.indexOf(face);
		}
		this.speciesFit[face] = null;
		// return true if all faces are now null, false otherwise
		return this.speciesFit.every(f=>f); 
	}
	
	/**
	shortcut to this.speciesFit.forEach(f)
	@param f callback
	 */
	forEachFace(f) {
		this.speciesFit.forEach(f);
	}
}