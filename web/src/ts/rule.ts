import {
	FACE_ROTATIONS,
	getSignedAngle,
	resize_array,
	RULE_ORDER,
	selectColor,
	strToVec,
	vecToStr
} from "./utils"
import * as THREE from "three"
import {BoxGeometry, BufferGeometry, Group, Material, Mesh, MeshLambertMaterial, Quaternion, Vector3} from "three"
import * as $ from "jquery"
import faceShape from "../ui/face.svg"

export const FACE_NAMES = ["left", "right", "bottom", "top", "back", "front"];

export function cubeTypeColor(i: number){
	return selectColor(i);
}

export function patchColor(i: number) : string{
	return selectColor( Math.abs(i) - 1);
}

export class PolycubePatch {
	color: number;
	alignDir: Vector3;
	direction: number;
	state_var: number;
	activation_var: number;
	visual: {
		// the large square of the patch
		big: THREE.Mesh;
		// the small square part of the patch that indicates orientation
		small: THREE.Mesh;

	};
	material: MeshLambertMaterial;

	constructor(color: number, direction: number | THREE.Vector3, alignment: THREE.Vector3 | number | undefined = undefined, state_var: number = 0, activationvar: number = 0) {
		this.color = color;
		if (direction instanceof THREE.Vector3){
			direction = RULE_ORDER.indexOf(direction);
		}
		if (typeof alignment == "number"){
			let default_alignment = FACE_ROTATIONS[direction].clone();
			default_alignment.applyAxisAngle(RULE_ORDER[direction],
				alignment * Math.PI / 2).round();
			alignment = default_alignment;
		}
		this.alignDir = alignment;
		console.assert(typeof direction == "number")
		this.direction = direction;
		let dir_vector: Vector3 = RULE_ORDER[direction];
		if (this.has_torsion()) {
			console.assert(this.alignDir.dot(dir_vector) < 1e-6)
		}
		this.state_var = state_var;
		this.activation_var = activationvar;
	}

	rotate(q) {
		let newFaceAlign = this.alignDir.clone().applyQuaternion(q).round();
		let newFaceDir = RULE_ORDER[this.direction].clone().applyQuaternion(q).round();
		let copy = new PolycubePatch(this.color, newFaceDir, newFaceAlign, this.state_var, this.activation_var);
		if ('visual' in this) {
			copy.visual = {
				big: this.visual.big.clone(),
				small: this.visual.small.clone()
			};
			copy.visual.big.position.applyQuaternion(q);
			// rotation is done by scaling (compress along RULE_ORDER[i] axis)
			copy.visual.big.scale.applyQuaternion(q);
			copy.visual.small.position.applyQuaternion(q);
			// rotation is done by scaling (compress along RULE_ORDER[i] axis)
			copy.visual.small.scale.applyQuaternion(q);
		}
		return copy;
	}

	has_color() {
		return this.color != 0;
	}

	has_torsion() {
		return typeof this.alignDir != "undefined";
	}

	abscolor() {
		return Math.abs(this.color);
	}
}

export class PolycubeCube {
	colors: any;
	readonly typeName: string;
	public readonly type_id: number;
	public state: boolean[];
	patches: PolycubePatch[];
	private activation_states: any[];
	// cube instance vars
	position: Vector3 | undefined;
	personalName: string | undefined;
	rotation: Quaternion | undefined;
	connections: (boolean | PolycubeSystemConnection)[];
	envvis: JQuery;
    cube_vis: Mesh | undefined;

	constructor(
			typeid: number,
			patches: PolycubePatch[],
			type_name: string | undefined,
			stateSize = 0) {
		console.assert(typeof typeid == "number")
		console.assert(patches.length == 6)
		this.type_id = typeid;
		if (typeof type_name == "undefined"){
			type_name = `CT${typeid}`;
		}
		this.typeName = type_name;
		this.patches = patches;
		// add 1 to state size to incorporate tautology variable
		this.state = Array(stateSize + 1).fill(false)
		this.state[0] = true;
	}

	clone(newName? : string | undefined, newtype: number | false = false) : PolycubeCube{
		/// SUSSSSS!!!!!~
		if (newName == void 0){
			newName = this.personalName;
		}
		let ctid : number;
		if (newtype === false) {
			ctid = this.type_id;
		}
		else {
			ctid = newtype;
		}
		let cube = new PolycubeCube(
			ctid,
			this.patches.map(patch => {
				let p = new PolycubePatch(patch.color, patch.direction, patch.alignDir, patch.state_var, patch.activation_var);
				if (patch.visual != undefined) {
					p.visual = {
						big: patch.visual.big.clone(),
						small: patch.visual.small.clone()
					}
				}
				return p;

			}), newName, this.state_size());
		cube.state = [...this.state];
		if ('activation_states' in this) {
			cube.activation_states = [...this.activation_states];
		}
		if ('position' in this) {
			cube.position = this.position.clone();
		}
		if ('personalName' in this) {
			cube.personalName = this.personalName;
		}
		if ('connections' in this) {
			cube.connections = [...this.connections]; //sus
		}
		if ('envvis' in this) {
			cube.envvis = this.envvis.clone();
		}
		if ('rotation' in this) {
			cube.rotation = this.rotation.clone();
		}
		return cube;
	}

	/**
	 *
	 * @returns {number} number of state variables (not counting tautology variable)
	 */
	state_size() : number{
		return this.state.length - 1
	}

	//https://stackoverflow.com/a/25199671
	rotate(q: Quaternion) : PolycubeCube{
		let connections = [];
		let new_patches = [];
		this.patches.forEach((patch, i) => {
			let iNewFace = RULE_ORDER.indexOf(RULE_ORDER[i].clone().applyQuaternion(q).round());
			if ('connections' in this) {
				connections[iNewFace] = this.connections[i];
			}
			new_patches[iNewFace] = patch.rotate(q);
		});
		let rotated_cube = this.clone();
		rotated_cube.patches = new_patches;
		rotated_cube.state = [...this.state];
		if ('position' in this) {
			rotated_cube.position = this.position;
		}
		if ('connections' in this) {
			rotated_cube.connections = connections; //sus
		}
		if ('personalName' in this) {
			rotated_cube.personalName = this.personalName;
		}
		// cache rotation, important for later
		// TODO: use this exclusively
		rotated_cube.rotation = q.multiply(rotated_cube.rotation);
		return rotated_cube;
	}

	hasAllostery() : boolean {
		return false;
	}

	patch_color(i: number) : number{
		return this.patches[i].color
	}

	patch_is_active(i: number) : boolean{
		return this.state[this.patches[i].activation_var];
	}

	face(i: number) : PolycubePatch {
		return this.patches[i];
	}

	instantiate(position: Vector3, instance_name: string) {
		console.assert(position instanceof Vector3);
		// copy object
		let copy = this.clone(instance_name, false);
		copy.rotation = new THREE.Quaternion().identity();

		// copy connections
		// TODO: do connections actually do anything?
		copy.connections = RULE_ORDER.map(x => false);

		// copy position
		copy.position = position;
		//https://stackoverflow.com/a/8084248

		// create new personal name
		copy.personalName = instance_name;
		return copy;
	}

	draw(connector_geometry: BoxGeometry, cube_mat: MeshLambertMaterial, cube_geo: BufferGeometry) : Group {
		let cube_vis_group = new THREE.Group();
		//draw main cube
		this.cube_vis = new THREE.Mesh(cube_geo, cube_mat);
		// cube.bindings_vis = [];
		cube_vis_group.add(this.cube_vis);
		// add binding sites on cube faces
		cube_vis_group.position.copy(this.position);
		cube_vis_group.name = "Cube";

		// init patch graphics
		this.patches.forEach((patch, i) => {
			if (patch.has_color()) {

				patch.material = new THREE.MeshLambertMaterial({
					color: patchColor(patch.color)
				});
				patch.material.transparent = true;
				patch.material.opacity = this.state[patch.activation_var] ? 1.0 : 0.5;
				if (patch.color >= 0) {
					patch.material.emissive = patch.material.color.clone().addScalar(-0.5);
				} else {
					patch.material.color.addScalar(-0.1);
				}
				patch.visual = {
					big: new THREE.Mesh(
						connector_geometry, patch.material
					),
					small: new THREE.Mesh(
						connector_geometry, patch.material
					)
				};
				cube_vis_group.add(patch.visual.small);
				cube_vis_group.add(patch.visual.big);
				patch.visual.big.position.add(
					RULE_ORDER[i].clone().multiplyScalar(0.4)
				);
				// dimension of patch
				let dim = RULE_ORDER[i].clone();
				dim.setX(Math.abs(dim.x)).setY(Math.abs(dim.y)).setZ(Math.abs(dim.z));
				// flatten visual mesh on appropriate axis
				patch.visual.big.scale.copy(
					new THREE.Vector3(1, 1, 1).sub(dim.multiplyScalar(0.65))
				);
				patch.visual.small.scale.copy(patch.visual.big.scale);
				patch.visual.small.position.copy(patch.visual.big.position);
				patch.visual.small.position.add(patch.alignDir.clone().multiplyScalar(0.2));
				patch.visual.small.scale.multiplyScalar(0.5);
			}
		});

		// add env browser elements
		this.envvis = $("<table class='env-vis-box'>");
		this.envvis.attr('name', this.personalName);
		this.envvis.append($(`<tr><td colspan="4"><b>Cube Type</b>: ${this.typeName}</td></tr>`));
		this.envvis.append($(`<tr><td colspan="4"><b>Cube Name</b>: ${this.personalName}</td></tr>`));
		this.envvis.append($(`<tr><td colspan="4"><b>Position</b>: ${vecToStr(this.position)}</td></td>`));
		this.envvis.append($(`<tr>
			<td style="border-bottom: 2px solid black;">Dir.</td>
			<td style="border-bottom: 2px solid black;">Ori.</td>
			<td style="border-bottom: 2px solid black;">Color</td>
			<td style="border-bottom: 2px solid black;">Activation Var.</td>
		</tr>`))
		this.patches.forEach((face, i) => {
			if (face.has_color()) {
				let face_label = $(`<tr class='face-label' name='${FACE_NAMES[i]}'>`);
				face_label.append($(`<td style="font-weight: bold;">${FACE_NAMES[i]}:</td>`))
				let face_rot = FACE_ROTATIONS[i].angleTo(face.alignDir) * (2 / Math.PI);
				face_label.append($(`<td style="width: 35px;"><img src=${faceShape} class="face-img rot${face_rot}" style="cursor: auto;"/></td>`));
				face_label.append($(`<td>${face.color}</td>`));
				// face_label.append($(`<td>${instance.conditionals[face.activation_var - RULE_ORDER.length - 1]}</td>`));
				face_label.append($(`<td>${face.activation_var}</td>`));
				this.refresh_patch_active_visual(i, face_label);
				this.envvis.append(face_label);
			}
		});
		this.envvis.append($(`<tr>
			<td style="border-bottom: 2px solid black;">Index</td>
			<td style="border-bottom: 2px solid black;">Value</td>
			<td colspan="2" style="border-bottom: 2px solid black;">Conditional</td>
		</tr>`));
		this.envvis.css('border-color', cubeTypeColor(this.type_id))
		return cube_vis_group;
	}

	toDec() : string {
		return this.patches.map((patch,i)=>{
			if (patch.color === 0) {
				return '';
			} else {
				let theta = getSignedAngle(FACE_ROTATIONS[i],
					patch.alignDir,
					RULE_ORDER[i]);
				let orientation = Math.round(theta * (2 / Math.PI) + 4) % 4;
				if (orientation == 0 && patch.state_var == 0 && patch.activation_var == 0){
					return `${patch.color}`
				}
				else if (patch.state_var == 0 && patch.activation_var == 0){
					return `${patch.color}:${orientation}`
				}
				else {
					return `${patch.color}:${orientation}:${patch.state_var}:${patch.activation_var}`;
				}
			}
		}).join('|');
	}

	num_colored_faces() : number{
		return this.colors.reduce((count, color) => count + (color != 0));
	}

	colored_faces_idxs() : number[] {
		return [...this.colors.keys()].filter(i => this.colors[i] != 0);
	}

	refresh_patch_active_visual(i_patch: number, face_label: JQuery) {
		let face = this.patches[i_patch];
		if (!this.patch_is_active(i_patch)) {
			let bg = `repeating-linear-gradient(45deg, ${patchColor(face.color)}, ${selectColor(face.color)} 1%, white 1%, white 2%)`;
			face_label.css('background-color', '');
			face_label.css('background-image', bg);
			(face.visual.big.material as Material).opacity = 0.5;
		} else {
			face_label.css('background-image', '');
			face_label.css('background-color', patchColor(face.color));
			(face.visual.big.material as Material).opacity = 1;
		}
	}

	// abstractish methods
	// we can't make PolycubeCube abstract for stupid reasons but we do need to define but not implement these
	set_patch_bound(idx){
		console.assert(false);
	}

	reeval_conditionals() : boolean[] {
		console.assert(false);
		return [];
	}

	//https://stackoverflow.com/a/25199671
	rotateSpeciesFromTo(vFrom: Vector3, vTo: Vector3) : PolycubeCube{
		let quaternion = new THREE.Quaternion(); // create one and reuse it
		quaternion.setFromUnitVectors(vFrom, vTo);
		return this.rotate(quaternion);
	}

	rotateSpeciesAroundAxis(axis: Vector3, angle: number) : PolycubeCube{
		let quaternion = new THREE.Quaternion(); // create one and reuse it
		quaternion.setFromAxisAngle(axis, angle);
		return this.rotate(quaternion);
	}

	public getPatchCoords() {
		return this.patches.filter(patch=>{
			return patch.color !== 0;
		}).map(patch=>RULE_ORDER[patch.direction]);
	}

}
export class StaticPolycubeCube extends PolycubeCube {
	conditionals: string[];
	/**
	 * The Static Polycube Cube is a subclass of PolycubeCube that has state size 12
	 * State 0 is the tautology varaible (always 1)
	 * States 1 - 6 are binding on patches (corresponding with RULE_ORDER in an unrotated cube)
	 * States 7 - 12 are activation of patches (corresponding with RULE_ORDER in an unrotated cube)
	 * @param type_id
	 * @param name
	 * @param patches
	 * @param conditionals
	 */
	constructor(type_id, patches?, type_name?: string, conditionals=Array(RULE_ORDER.length).fill("")) {
		super(type_id, patches, type_name, 2 * RULE_ORDER.length); // constructor will add tautology variable

		// set non-allosteric activation variables to true
		for (let i = 0; i < RULE_ORDER.length; i++){
			if (!conditionals[i].trim()){
				this.state[i + RULE_ORDER.length + 1] = true;
			}
		}
		// conditionals which determine values for state vars 7 - 12
		// does NOT need to be reindexed with rotations b/c patches keep their
		// state and activation var idxs when they're rotated
		this.conditionals = conditionals;
		this.reeval_conditionals();
	}

	hasAllostery() {
		return this.patches.some((p,i) => {
			return this.patch_allosterically_controlled(i);
		} );
	}

	patch_allosterically_controlled(i){
		if (this.patches[i].activation_var  == 0){
			return false;
		}
		let conditional = this.conditionals[this.patches[i].activation_var - RULE_ORDER.length - 1];
		return (conditional.trim().length > 0) && (conditional != "(true)");
	}

	patch_is_active(idx){
		return !this.patch_allosterically_controlled(idx) || this.state[this.patches[idx].activation_var];
	}

	set_patch_bound(idx){
		this.state[this.patches[idx].state_var] = true;
	}

	/**
	 re-evaluates the activation states of the faces, based on which faces are bound. returns
	 true if any activation state has changed, false otherwise
	 */
	reeval_conditionals() : boolean[] {
		// init state change list
		let state_changed = Array(RULE_ORDER.length).fill(false);

		// copy state variables 1-6 to temporary variable b
		// b should start at 0 for backwards compatibility reasons
		let b = this.state.slice(1, 1 + RULE_ORDER.length);

		for (let i_conditional = 0; i_conditional < RULE_ORDER.length; i_conditional++){
			if (this.conditionals[i_conditional].trim()) {
				let cond_var_idx = 1 + RULE_ORDER.length + i_conditional;
				// save current value for comparison
				let prev_var_val = this.state[cond_var_idx];
				this.state[cond_var_idx] = eval(this.conditionals[i_conditional]);
				// check if state has changed
				state_changed[cond_var_idx] = prev_var_val != this.state[cond_var_idx];
			}
		}

		// // iterate conditionals for activations
		
		// if any states changed and this cube has a visualization in three.js, update visualizer
		if (state_changed.some(Boolean) && 'personalName' in this) {
			// loop patches
			this.patches.forEach((patch, i_patch) => {
				// if the patch has a color and is allosterically controlled
				if (patch.color != 0 && this.patch_allosterically_controlled(i_patch) && state_changed[patch.activation_var]) {
					// grab var for binding visualization
					let activation = this.state[patch.activation_var];

					// loop binding visualization components
					(patch.visual.big.material as Material).opacity = (activation ? 1 : 0.5)
				}
			});
		}
		return state_changed;
	}

	clone(newName? : string | undefined, newtype: number | false = false) {
		let copy = super.clone(newName, newtype) as StaticPolycubeCube;
		copy.conditionals = [...this.conditionals];
		return copy;
	}

	instantiate(position: Vector3, instance_name: string) {
		let instance = toStatic(super.instantiate(position, instance_name));
		instance.rotation = new THREE.Quaternion().identity();

		instance.conditionals = [...this.conditionals];
		instance.reeval_conditionals();

		return instance;
	}

	draw(connector_geometry: BoxGeometry, cube_mat: MeshLambertMaterial, cube_geo: BufferGeometry) : Group  {
		let g = super.draw(connector_geometry, cube_mat, cube_geo);
		this.state.forEach((statevar, i) =>{
			let staterow = $(`<tr class='state-label'>`);
			staterow.append($(`<td>${i}</td>`));
			staterow.append($(`<td name="state${i}">${statevar}</td>`));
			if (i - (RULE_ORDER.length + 1) >= 0)
			{
				let conditional = this.conditionals[i - (RULE_ORDER.length + 1)];
				staterow.append($(`<td colspan="2">${conditional}</td>`));
			}
			else {
				staterow.append($("<td>"));
			}
			this.envvis.append(staterow);
		});
		return g;
	}

	toDec() {
		return this.patches.map((patch,i)=>{
			let conditional = this.conditionals[patch.activation_var - (RULE_ORDER.length + 1)];
			if (patch.color === 0) {
				return '';
			} else {
				let orientation = Math.round(getSignedAngle(FACE_ROTATIONS[i], patch.alignDir, RULE_ORDER[i])*(2/Math.PI)+4)%4;
				return `${patch.color}:${orientation}:${conditional != "(true)" ? conditional : ""}`;
			}
		}).join('#')
	}

	rotate(q: Quaternion): PolycubeCube {
		return toStatic(super.rotate(q));
	}
}

export default class DynamicPolycubeCube extends PolycubeCube {
	effects: any[];
	constructor(type_id, patches?, name?, state_size=0, effects=[]) {
		super(type_id, patches, name, state_size);
		this.effects = effects;
	}

	hasAllostery() {
		return this.patches.some((p,i) => {
			return this.patch_allosterically_controlled(i);
		} );
	}

	patch_allosterically_controlled(i){
		return this.patches[i].activation_var != 0;
	}

	patch_is_active(idx){
		if (!this.patch_allosterically_controlled(idx)){
			return true;
		}
		else if (this.patches[idx].activation_var > 0){
			return this.state[this.patches[idx].activation_var];
		}
		else {
			return !this.state[Math.abs(this.patches[idx].activation_var)];
		}
	}

	set_patch_bound(idx){
		this.state[this.patches[idx].state_var] = true;
	}

	reeval_conditionals() : boolean[] {
		let change;
		let newState = [...this.state]
		do {
			change = false;
			this.effects.forEach(effect=>{
				let can_fire = effect.sources.every(s=>newState[s]);
				if (can_fire && !newState[effect.target]){
					change = true;
					newState[effect.target] = true;
				}
			});
		} while (change);
		let changes = this.state.map((x,i)=>{
			return x !== newState[i]
		});
		this.state = newState
		return changes;
	}

	clone(newName? : string | undefined, newtype: number | false = false) {
		let copy = toDynamic(super.clone(newName, newtype));
		copy.effects = [...this.effects];
		return copy;
	}

	instantiate(position: Vector3, instance_name: string) {
		let instance : DynamicPolycubeCube = toDynamic(super.instantiate(position, instance_name));
		instance.rotation = new THREE.Quaternion().identity();

		instance.effects = [...this.effects];
		instance.reeval_conditionals();
		return instance;
	}

	draw(connector_geometry: BoxGeometry, cube_mat: MeshLambertMaterial, cube_geo: BufferGeometry) : Group {
		let g = super.draw(connector_geometry, cube_mat, cube_geo);
		this.state.forEach((statevar, i) =>{
			let staterow = $(`<tr class='state-label'>`);
			staterow.append($(`<td>${i}</td>`));
			staterow.append($(`<td name="state${i}">${statevar}</td>`));

			if (i != 0) {
				staterow.append($(`<td colspan="2">Dynamic Effect</td>`));
			}
			else {
				staterow.append($(`<td>`));
			}
			this.envvis.append(staterow);
		});
		return g;
	}

	update_state_size() {
		let new_state_size = this.state.length;
		this.patches.forEach(p=>{
			new_state_size = Math.max(new_state_size, p.state_var);
			new_state_size = Math.max(new_state_size, Math.abs(p.activation_var));
		});
		new_state_size = Math.max(new_state_size, ...this.effects.map(e=>{return e.target;}));
		resize_array(this.state, new_state_size);
	}

	toDec() : string {
		let decstr = super.toDec();
		if (this.effects.length > 0){
			decstr += "@" + this.effects.map(e=> {
				return `[${e.sources.join(",")}]>${e.target}`;
			}).join(";")
		}
		return decstr;
	}

	rotate(q: Quaternion): PolycubeCube {
		return toDynamic(super.rotate(q));
	}
}

function toDynamic(c: PolycubeCube) : DynamicPolycubeCube {
	let newCube = new DynamicPolycubeCube(
		c.type_id,
		c.patches,
		c.typeName,
		c.state_size()
	);
	Object.assign(newCube, c);
	return newCube;
}

function toStatic(c: PolycubeCube) : StaticPolycubeCube {
	let newCube = new StaticPolycubeCube(
		c.type_id,
		c.patches,
		c.personalName
	);
	Object.assign(newCube, c);
	return newCube;
}

/**

 */
export function ruleToDec(cubeTypes: PolycubeCube[]) : string{
	if (cubeTypes.length > 0) {
		return cubeTypes.map(ct => ct.toDec()).join('_');
	}
	else {
		return "";
	}
}

/**
 */
export function parseDecRule(rulesStr: string) : PolycubeCube[]{
	// split by underscore
    return rulesStr.split('_').map((s, j)=>{
		let patch_conditionals = RULE_ORDER.map(x=>"");
		var state_size = 1;
		let delimeter;
		if (s.match(/^([^|]*\|){5}[^|]*@?.*?$/)){
			delimeter = "|";
		}
		else {
			delimeter = "#";
		}
		var face_props: [string, string, string, string] | [string, string, string];
		let patches = s.split("@")[0].split(delimeter).map((face, i) => {
			let state_var: string = "0";
			let activation_var: string = "0";
			let i_color: number = 0;
			let r = FACE_ROTATIONS[i].clone();
			let logic = "";
			if (!(face.trim() == "")) {
				// @ts-ignore
				face_props = face.split(":");
				let color = face_props[0];
				if (face_props.length > 1) {
					let patchOriIdx: string = face_props[1];
					// color, orientation, state var, activation var
					if (face_props.length == 4){
						[color, patchOriIdx, state_var, activation_var] = face_props;
						var i_state_var = parseInt(state_var);
						var i_activation_var = parseInt(activation_var);
						state_size = Math.max(state_size, Math.abs(i_state_var), Math.abs(i_activation_var));
					}
					if (face_props.length == 3) {
						[color, patchOriIdx, logic] = face_props;
						// var b for querying in inline js statements in static formulation
						// (DEPRECATED!!!)
						let b = Array(RULE_ORDER.length).fill(false);
						if (logic.trim().length > 0) {
							try {
								eval(logic);
							} catch (e) {
								throw `Malformed rule - malformed logical statement ${logic[i]}`;
							}
						}
					}
					i_color = parseInt(color);
					let i_orientation : number = parseInt(patchOriIdx);
					//[colors[i], orientation] = face.slice(0, logic_start).split(':').map(v=>parseInt(v));
					if (isNaN(i_color) || isNaN(i_orientation)) {
						throw "Malformed rule";
					}
					r.applyAxisAngle(RULE_ORDER[i], i_orientation * Math.PI / 2).round();
					// if this string is in the dynamic format
					if (face_props.length == 3) {
						patch_conditionals[i] = logic;
					}
				}

			}

			return new PolycubePatch(i_color,
				i, r,
				i_state_var,
				i_activation_var);
		});
		console.assert(patches.length == RULE_ORDER.length)
		if (!patch_conditionals.some(x=>x.length > 0)){
			let effects;
			if (s.search("@") > -1) {
				effects = s.split("@")[1].split(";").map(e_str => {
					let [sources, target] = e_str.split(">");
					const regex = /-?\d+/g;
					const matches = sources.match(regex);

					// Convert string matches to numbers and return the resulting array
					return {
						target: Number(target),
						sources: matches.map(Number)
					};
				});
			}
			else {
				effects = [];
				state_size = 1;
			}
			 let ct = new DynamicPolycubeCube(j, patches, `CT${j}`, state_size, effects)
			ct.update_state_size()
			return ct;
		}
		else {
			return new StaticPolycubeCube(j, patches, `CT${j}`, patch_conditionals);
		}
    });
}

/**
https://stackoverflow.com/a/45054052 
*/
export function parseHexRule(ruleStr) {
    let ruleSize = RULE_ORDER.length;
    let rule = [];
    for (let i=0; i < ruleStr.length; i+=2*ruleSize) {
        let cube_type = [];
        //console.log("Rule ",(i/(2*ruleSize))+1);
        for (let j = 0; j<ruleSize; j++) {
            let face = ruleStr.substring(i+(2*j), i+(2*j) + 2);
            let binStr = (parseInt(face, 16).toString(2)).padStart(8, '0');
            let sign = parseInt(binStr[0], 2);
            let color = parseInt(binStr.substring(1,6),2);
            let orientation = parseInt(binStr.substring(6,8),2);

            let r = FACE_ROTATIONS[j].clone();
            r.applyAxisAngle(RULE_ORDER[j], orientation*Math.PI/2);
            r.round();
            cube_type.push( {'color': color * (sign ? -1:1), 'alignDir': r} );
        }
        rule.push(cube_type);
    }
    //added this line of code to switch to new method of storing rules
  	rule = rule.map((x,i)=>{
		  return new DynamicPolycubeCube(i, x.map((patch, i) => {
			  return new PolycubePatch(patch.color, i, patch.alignDir, 0, 0);
		  }), `CT${i}`);
	});
    return rule;
}
// Accepts either ~ or | as face separators
// and either . or : as rotation separators
// export function parseDecRuleOld(ruleStr) {
// 	return ruleStr.split('_').map((s,j)=>{
// 		return new StaticPolycubeCube(
// 			`CT${j}`,
// 			s.split(/[|.]/).map((face,i)=>{
// 				let color = 0;
// 				let orientation = 0;
// 				if (face !== '') {
// 					let faceVal = face.split(/[r:]/).map(v=>parseInt(v));
// 					color = faceVal[0]
// 					if (faceVal.length > 1){
// 						orientation = faceVal[1];
// 					}
// 				}
// 				let r = FACE_ROTATIONS[i].clone();
// 				r.applyAxisAngle(RULE_ORDER[i], orientation*Math.PI/2).round();
// 				return new PolycubePatch(color, undefined, r, i + 1, i + 1 + RULE_ORDER.length);
// 			})
// 		);
// 	});
// }
/**
@deprecated */
export function ruleToHex(rule) {
    const ruleSize = 6;
    let ruleStr = "";
    for (let i=0; i< rule.length; i++) {
        for (let j = 0; j<ruleSize; j++) {
            const face = rule[i].face(j);
            const sign = face.color < 0 ? "1" : "0";
            const color = Math.abs(face.color).toString(2).padStart(5,'0');
            let ori_num = (getSignedAngle(FACE_ROTATIONS[j], face.alignDir, RULE_ORDER[j])*(2/Math.PI)+4)%4
            let ori_str = ori_num.toString(2).padStart(2,'0');
            const binStr = sign + color + ori_str;
            const hexStr = parseInt(binStr,2).toString(16).padStart(2,'0');
            ruleStr += hexStr;
        }
    }
    return ruleStr;
}

export function cubeTypeFromJSON(jsonobj, name) {
	// init blank patches in case some are not in JSON file
	let patches = [...Array(6).keys()].map((_, i)=> {
		return new PolycubePatch(0, undefined, FACE_ROTATIONS[i]);
	});

	jsonobj.patches.forEach((patchobj, i) => {
		let idx;
		// if the patch direction is specified,
		if ("dir" in patchobj) {
			let patchDir = new THREE.Vector3(
				patchobj.dir.x,
				patchobj.dir.y,
				patchobj.dir.z);
			idx = RULE_ORDER.indexOf(patchDir);
		}
		else {
			idx = i;
		}
		console.assert(patches[idx].color == 0);
		if ("alignDir" in patchobj) {
			patches[idx] = new PolycubePatch(patchobj.color, undefined, new THREE.Vector3(
				patchobj.alignDir.x,
				patchobj.alignDir.y,
				patchobj.alignDir.z));
		}
		else {
			patches[idx] = new PolycubePatch(patchobj.color, undefined, strToVec(patchobj.orientation));
		}
		patches[idx].state_var = patchobj.state_var;
		patches[idx].activation_var = patchobj.activation_var;
	});
	// TODO: import effects
	if ("effects" in jsonobj){
		return new DynamicPolycubeCube(name, patches, jsonobj.state_size, jsonobj.effects)
	}
	else {
		return new StaticPolycubeCube(name, patches);
	}
}

export class PolycubeSystemConnection {
	private cube_1: PolycubeCube;
	private cube_2: PolycubeCube;
	private color: number;
	/**
    @param cube_1 the first cube for this connection
    @param cube_2 the second cube for this connection
    @param color the color of the connection
     */
	constructor(cube_1, cube_2, color){
		this.cube_1 = cube_1;
		this.cube_2 = cube_2
       	this.color = Math.abs(color)
    }
}