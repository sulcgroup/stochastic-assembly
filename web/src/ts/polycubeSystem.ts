// three.js imports
import * as THREE from "three";
import {Group, Mesh, Vector3} from "three";
// import seedrandom library
import seedrandom, {PRNG} from "seedrandom";

import {
	PolycubeCube,
	PolycubeSystemConnection,
	ruleToDec
} from "./rule";

import {
	allRotations,
	getSignedAngle,
	randOrdering, randstr, range,
	RULE_ORDER, shuffleArray,
	strToVec,
	vecToStr
} from "./utils";
import {PolycubeMove} from "./move";

// IMPORTANT: THESE ARE VERY DIFFERENT FROM JOAKIM'S ASSEMBLY METHODS
enum AssemblyMethod {
	// Stochastic method includes one-pot and non-stepwise staging
	// it assumes that each stage continues until no moves remain
	Stochastic,
	// stepwise-staging method is used for piece construction, may have future applications
	// it assumes that stage numbers are also step numbers
	StepwiseStaging
}

class AssemblyComponentList<T extends  (PolycubeCube | PolycubeSystem)> {
	readonly index: number;
	private _items: T[];

	constructor(idx: number, items: T[] = []) {
		this.index = idx;
		this._items = items;
	}

	r(rng: PRNG){
		return this._items[Math.floor(rng() * this.size())]
	}

	// Method to add an item to the list
	add(item: T) {
		this._items.push(item);
	}

	in(item: T) : boolean {
		return this._items.some(a => item == a);
	}

	// Method to remove an item from the list
	removeItem(item: T): void {
		this._items = this._items.filter(listItem => listItem !== item);
	}

	// Method to get the size of the list
	size(): number {
		return this._items.length;
	}

	forEach(f: (num) => Set<number>) {
		this._items.forEach(f);
	}

	copy() : AssemblyComponentList<T> {
		return new AssemblyComponentList<T>(this.index, [...this._items]);
	}

	pop() : T {
		return this._items.pop();
	}

	shuffled(rng: PRNG) : AssemblyComponentList<T> {
		let items_shuffled = [...this._items];
		shuffleArray(items_shuffled, rng);
		return new AssemblyComponentList<T>(this.index, items_shuffled)
	}

	get(idx: number) : T{
		console.assert(idx >= 0)
		console.assert(idx < this.size());
		return this._items[idx];
	}
}

class PiecewiseStage {
	index: number;
	colormap: Map<number, AssemblyComponentList<PolycubeSystem>>;
	all_pieces: AssemblyComponentList<PolycubeSystem>;

	constructor(idx: number) {
		this.index = idx;
		this.colormap = new Map();
		this.all_pieces = new AssemblyComponentList<PolycubeSystem>(idx);
	}

	add(p: PolycubeSystem){
		p.forEachMove((_, m)=>{
			let move = p.getMove(m);
			move.forEachFace(f=>{
				if (f) {
					if (!(-f.color in this.colormap)) {
						this.colormap[-f.color] = new AssemblyComponentList<PolycubeSystem>(this.index);
					}
					this.colormap[-f.color].add(p);
				}
			});
		});
		this.all_pieces.add(p);
	}

	contains(p: PolycubeSystem) : boolean {
		return this.all_pieces.in(p);
	}

	hasColor(c: number) : boolean {
		return c in this.colormap;
	}
}

export class PolycubeSystem {
	// important ones!
	// list of all possible moves
	protected moves: Map<string, PolycubeMove>;
	// list of keys for moves, which are depleted as the program checks possible moves, and
	// reset at a new step
	protected moveKeys: Vector3[];
	// cubes
	protected cubes: Map<string, PolycubeCube>;
	// map of string reps of coords -> cube objs
	cube_name_map: Map<string, PolycubeCube>; // maps cube personal names to cube instances
	/// ... or that's what i thought at least; i'm actually not convinced at this point that this does ANYTHING
	// current maximum coordinate value
	private currMaxCoord: number;
	// list of keys for possuble moves
	// moveKeys: any[];
	// center of mass of the entire polycube
	// max allowed number of cubes
	protected nMaxCubes: number;
	// max allowed coord
	protected maxCoord: number;
	private currMinCoord: number;
	protected maxPieceSize: number;

	// private pieces: PolycubeSystem[];
	// map showing which colors appear in which pieces
	// private pieceColorMap: {};

	// ASSEMBLY PARAMETERS!!!!!
	// "stochatic" or "seeded"
	// staging order is a list of sets
	// each set is a stage
	// for unstaged assemblies, staging.size == 1
	protected staging: Array<AssemblyComponentList<PolycubeCube>>;
	// for piecewise-assembly systems, we need an additional array for piecewise stages
	protected piecewise_staging: Array<PiecewiseStage> | undefined;
	// index in `staging` of current stage of assembly
	protected current_stage: number
	protected assembly_method: AssemblyMethod;

	// torsion or no?
	protected torsion: boolean;
	// step counter
	protected steps: number;
	// graphics materials for object colors
	protected cubeTypeCount: any;
	public objGroup: Group;
	protected connections: any[];
	protected confMap: Map<any, any>;
	public cube_types: PolycubeCube[];
	// number of correct color matches
	private matches: number;
	// number of incorrect color matches
	private mismatches: number;

	private mismatches_allowed: boolean;


	// system-specific rng
	protected rng_seed: string;
	private rng: seedrandom.PRNG;

	/**
	 @param rules: the rules to use to construct this system
	 @param scene: root object for THREE graphics
	 @param nMaxCubes: the maximum number of cubes to use to construct this system
	 @param maxCoord: the maximum distance along any axis from the center that the system will tolarate
	 @param assemblyMode
	 'ordered', and 'seeded'
	 @param buildConfmap: ?????
	 @param torsion: true to make torsion active, false otherwise
	 * @param envbrowser
	 * @param maxPieceSize
	 * @param rand_seed
	 */
    constructor(nMaxCubes=1000,
				maxCoord=100,
				buildConfmap=true,
				torsion = true,
				maxPieceSize=1,
				rand_seed: string = "abcd") {
        /**
    	@type dict
    	@desc a dict where keys are vector strings and values are move objects
         */
        this.moves = new Map<string, PolycubeMove>();

        this.moveKeys = [];

        /**
    	@type THREE.Vector3
    	@desc something something graphics? @todo fill in real descriptio
         */

        /**
    	@type int
    	@desc the maximum number of cubes tat the system will model before it stops adding more cubes
         */
        this.nMaxCubes = nMaxCubes;
		this.cube_types = [];

		this.cube_name_map = new Map()

		// maximum coordinate possible in this build space
        this.maxCoord = maxCoord;

		// minimum and maximum coordinates of this structure - will be updated
		// as structure assembles
        this.currMinCoord = 0;
        this.currMaxCoord = 0;

		this.current_stage = 0;

		this.torsion = torsion;

		this.staging = [new AssemblyComponentList<PolycubeCube>(0)];
		this.cubes = new Map();

        this.maxPieceSize = maxPieceSize;

		this.mismatches_allowed = true;
        
        if (this.maxPieceSize > 1){
			this.piecewise_staging = [new PiecewiseStage(0)];
		}

        this.steps = 0;

        this.cubeTypeCount = [];

        if (buildConfmap) {
            this.confMap = new Map();
        }


        // semi-deprectated count of successful connections
        this.matches = 0;
        
        // semi-deprecated count of unsuccessful connections
        this.mismatches = 0;
        
        // list of connections between two blocks
        this.connections = [];


		this.currMinCoord = 0;
		this.currMaxCoord = 0;

		this.reset_rng(rand_seed);
    }

	public hasTorsion() : boolean{
		return this.torsion;
	}

	/**
	 * adds a cube type
	 * @param cubeType
	 */
	public addCubeType(cubeType: PolycubeCube, update_piecewise: boolean = true) {
		this.cube_types.push(cubeType);
		if (this.staging.length == 1){
			this.staging[0].add(cubeType);
		}
		if (this.isPiecewise() && update_piecewise) {
			this.refresh_piecewise_staging();
		}
	}

	/**
	 * toggles whether a cube type is allowed to be used
	 * for simplicity, we'll treat this for now as adding/removing from
	 * @param i
	 */
	public toggleCubeType(i: number) {
		let ct = this.cube_types[i];
		// Check if `i` exists in the first set
		if (this.staging[0].in(ct)) {
			// If it exists, remove it
			this.staging[0].removeItem(ct);
		} else {
			// If it doesn't exist, add it
			this.staging[0].add(ct);
		}
	}

	/**
	 * tests if the provided cube type is allowed at the provided stage of assembly
	 */
	public cube_type_allowed(cube_type_idx: number, stage_idx: undefined | number = undefined) : boolean {
		if (stage_idx === undefined){
			stage_idx = this.current_stage;
		}
		return cube_type_idx in this.staging[stage_idx];
	}

	/**
	 * returns the number of cube types that are accessable in any stage of assembly
	 */
	countAllowedCubeTypes(): number {
		// Create a set to hold the unique values
		let unionSet = new Set<number>();

		// Iterate over each set in staging
		for (let set of this.staging) {
			// Add each number in the set to the union set
			set.forEach(num => unionSet.add(num));
		}

		// The size of the union set is the number of unique values
		console.assert(unionSet.size <= this.numCubeTypes());
		return unionSet.size;
	}

	allowedCubeTypes(stage: number | undefined= undefined): AssemblyComponentList<PolycubeCube> {
		if (typeof stage == "undefined"){
			stage = this.current_stage;
		}
		return this.staging[stage].copy();
	}

	numStages() : number{
		return this.staging.length;
	}

	cubeTypeIndex(r){
		for (let i = 0; i < this.cube_types.length; i++){
			if (this.cube_types[i].typeName == r.typeName){
				return i;
			}
		}
		return -1;
	}
	
	numCubeTypes() {
		return this.cube_types.length;
	}

	removeCubeType(ct: PolycubeCube | number) {
		if (ct instanceof PolycubeCube) {
			this.removeCubeType(ct.type_id);
		}
		else {
			// treat ct as type id
			// loop cube types
			for (let i = 0; i < this.cube_types.length; i++){
				// we cannot assume that if ct is a PolycubeCube, ct.typeid is the index in cube_types
				if (this.cube_types[i].type_id == ct){
					this.set_rule(this.cube_types.splice(i, 1));
					break;
				}
			}
			// gotta remove cube types from staging
			for (let i_stage = 0; i_stage < this.staging.length; i_stage++){
				for (let i_ct = 0; i_ct < this.staging[i_stage].size(); i_ct++){
					let staging_ct = this.staging[i_stage].get(i_ct);
					if (staging_ct.type_id == ct){
						this.staging[i_stage].removeItem(staging_ct);
						break;
					}
				}
			}
			this.refresh_piecewise_staging();
		}
	}

	getAssemblyMethod() : AssemblyMethod {
		return this.assembly_method;
	}

	setAssemblyMethod(a: string | AssemblyMethod) {
		if (typeof a === 'string') {
			switch (a) {
				case "Ordered":
				case "Stepwise":
					this.assembly_method = AssemblyMethod.StepwiseStaging;
					break;
				case "Stochastic":
					this.assembly_method = AssemblyMethod.Stochastic;
					break;
				// ... handle other string cases if necessary ...
			}
		}
		else {
			this.assembly_method = a;
		}
	}

	public setMisMatchesAllowed(bNewVal: boolean){
		this.mismatches_allowed = bNewVal;
	}

	public numMismatches() : number {
		return this.mismatches;
	}

	clone(){
		let copy = new PolycubeSystem(
			this.nMaxCubes,
			this.maxCoord,
			this.confMap === undefined,
			this.torsion,
			this.maxPieceSize);
		copy.set_rule(this.cube_types);

		[...this.cubes.values()].forEach((v) =>
		{
			copy.cubes.set(vecToStr(v.position), v.clone(undefined,false));
		});
		[...this.moveKeys.values()].forEach((v, i) => {
			copy.moveKeys[i] = v;
			copy.moves.set(vecToStr(v), this.getMove(v).clone());
		});
		copy.steps = this.steps;
		if (typeof this.piecewise_staging == "undefined") {
			copy.piecewise_staging = undefined;
		}
		else {
			copy.staging = this.staging.map(a=>a.copy());
		}
		copy.mismatches_allowed = this.mismatches_allowed;
		return copy;
	}

    isPolycubeSystem() {
        return true;
    }
    
    isPiecewise(){
		return this.maxPieceSize > 1 && this.cube_types.some(r=>r.hasAllostery());
	}

	public setMaxPieceSize(n: number){
		this.maxPieceSize = n;
	}

	/**
	 * Resets staging, so there's only one assembly stage which contains all particles
	 */
	clear_staging() {
		this.staging = [new AssemblyComponentList<PolycubeCube>(0, [...this.cube_types])];
	}

	numCubes(){
		return this.cubes.size;
	}

	// adds initial "seed" particle
    seed() {
        let i: number;
		if (this.cube_types.length == 0 || this.countAllowedCubeTypes() == 0){
			console.error("No cube types!!!")
			return;
		}

        if (this.countAllowedCubeTypes() > 0) {
			if (this.isPiecewise()){
				// choose random seed piece
				let seed_piece = this.piecewise_staging[0].all_pieces.r(this.rng);
				seed_piece.cubes.forEach((c, k)=>{
					this.addParticle(c.instantiate(c.position, this.genCubeName()));
				});
				this.steps += seed_piece.numCubes();
			}
			else {
		        let seed_cube = this.staging[0].r(this.rng).instantiate(new THREE.Vector3(0, 0, 0), this.nameNewCubeType());
		        this.addParticle(seed_cube);
				this.steps++;
			}
	    } else {
			//this will likely occur mainly if not only if there's no rules
			console.log("No rule!");
		}
    }

	reset_rng(newseed? : string | undefined) {
		if (newseed != void 0) {
			this.rng_seed = newseed;
		}
		this.rng = seedrandom(this.rng_seed);
	}

    reset(reset_random=true) {
		if (reset_random) {
			this.reset_rng();
		}
		this.steps = 0;
		this.current_stage = 0;
		this.cubes = new Map<string, PolycubeCube>();
        this.moves = new Map<string, PolycubeMove>();
        if (this.confMap) {
            this.confMap = new Map;
        }
        this.matches = 0;
        this.mismatches = 0;
        this.connections = [];
    }

    regenerate() {
        this.reset();
        this.seed();
        //this.processMoves();
	}

    set_rule(rules : PolycubeCube[] = [], reset_random=true) {
		// if no change has been made to rule
		if (ruleToDec(rules) == ruleToDec(this.cube_types)){
			return;
		}

		this.cube_types = [];
		rules.forEach(r=>{this.addCubeType(r, false)});

		// reset staged-assembly pieces
		if (this.isPiecewise()) {
			this.refresh_piecewise_staging();
		}
    }

	refresh_piecewise_staging() {
		this.piecewise_staging = this.staging.map(s=>new PiecewiseStage(s.index));
		for (let iStage = 0; iStage < this.numStages(); iStage++){
			let stageColorMap = new Map<number, AssemblyComponentList<PolycubeSystem>>();
			for (let ct in this.allowedCubeTypes(iStage)){
				// add single-cube pieces
				for (let i_rule = 0; i_rule < this.numCubeTypes(); i_rule++){
					if (this.cube_type_allowed(i_rule))
					{
						let p = new PolycubeSystem(
							null,
							1,
							false,
							true,
							1,
							randstr(8, this.rng));
						p.set_rule([this.cube_types[i_rule].clone()])
						p.seed();
						this.addPiece(p, iStage);
					}
				}
			}

			// loop through every possible piece by looping every possible order in
			// which to add this.maxPieceSize rules
			// potential problem: program will still loop through moves in a random order.
			// will this disrupt the formation of unique pieces? ask a better mathemetician
			let move_orders: AssemblyComponentList<PolycubeCube>[][] = this.getAllPossibleMoveOrders(); // will automatically only generate rule orders with allowed rules
			for (let iMoveOrder = 0; iMoveOrder < move_orders.length; iMoveOrder++) {
				if (!move_orders[iMoveOrder].some(ct => this.cube_types[ct.get(0).type_id].hasAllostery())) {
					continue; //skip making pieces out of all non-allosteric rules
				}
				let p = new PolycubeSystem(
					this.maxPieceSize,
					this.maxPieceSize,
					false,
					this.torsion,
					1,
					randstr(8, this.rng));
				p.set_rule(this.cube_types.map(a => a.clone()));
				p.reset(true);
				p.seed();
				while (p.steps < this.maxPieceSize && p.moveKeys.length > 0) {
					p.step();
				}
				p.resetMoves();
				if (!this.piecewise_staging[iStage].contains(p)) {
					this.piecewise_staging[iStage].add(p);
				}
			}
		}
		this.reset_rng();
	}

	public numSteps() : number {
		return this.steps;
	}
    
    addPiece(p: PolycubeSystem, stage=0){
		this.piecewise_staging[stage].add(p);
	}

    getRuleStr() : string{
        return ruleToDec(this.cube_types);
    }

	setMaxCubes(n: number) {
		this.nMaxCubes = n;
	}

    compatibleColors(c1: number, c2: number) :boolean{
        return c1 == -c2;
    }
    
    countColors() : number{
		return this.listColors().length;
	}
	
	listColors(absvals=true) : any[]{
		let allRules = [].concat.apply([], this.cube_types.map(x=>{
			return x.colors.map(c=>absvals ? Math.abs(c) : c);	
		}));
		return [...new Set(allRules)];
	}
    
    /**
    @param c1
    @param c2
    @param color the color of the connection (should be able to infer but guess not
     */
    addConnection(c1: PolycubeCube, c2: PolycubeCube, color: number){
		// create connection object
		let conn = new PolycubeSystemConnection(c1, c2, color);
    	this.connections.push(conn);

		// locate patch 1 idx
		let patch1idx = RULE_ORDER.indexOf(c2.position.clone().sub(c1.position));
		// assign connection object
    	c1.connections[patch1idx] = conn;
		// update state
		c1.set_patch_bound(patch1idx);

		// locate patch 2 idx
		let patch2idx = RULE_ORDER.indexOf(c1.position.clone().sub(c2.position));
		// assign connection object
    	c2.connections[patch2idx] = conn;
		// update state
		c2.set_patch_bound(patch2idx);

    	for (const cube of Array(c1, c2)) {
			//TODO: will have to add a LOT more here if/when I add dynamism
			if (cube.reeval_conditionals().some(Boolean)) {
				this.updateMoves(cube);
			}
		}
    }
	
	getCube(position: string | Vector3 | number) : PolycubeCube{
		let c;
		if (position instanceof Object && position.isVector3){
			c = this.cubes.get(vecToStr(position));
		}
		else if (typeof position == "string"){
			c = this.cubes.get(position);
		}
		else {
			console.assert(position instanceof Number)
			// @ts-ignore
			c = this.cubes.get(this.cubes.keys()[position]);
		}
		console.assert(c != void 0, `Invalid position type ${typeof position}`);
		return c;
	}

	hasCube(position: string | Vector3) : boolean {
		if (position instanceof Object && position.isVector3){
			return this.cubes.has(vecToStr(position));
		}
		else {
			console.assert(typeof position == "string")
			return this.cubes.has(<string>position);
		}
	}

	forEachCube(f: (PolycubeCube, string) => void){
		this.cubes.forEach(f);
	}

	getMove(position: string | Vector3) : PolycubeMove {
		if (position instanceof Object && position.isVector3){
			return this.moves.get(vecToStr(position))
		}
		else {
			console.assert(typeof position == "string")
			return this.moves.get(<string>position)
		}
	}

	hasMove(position: string | Vector3) : boolean {
		if (position instanceof Object && position.isVector3){
			return this.moves.has(vecToStr(position))
		}
		else {
			console.assert(position instanceof String)
			return this.moves.has(<string>position)
		}
	}

	public forEachMove(f: (PolycubeMove, string) => void) {
		this.moves.forEach(f);
	}

	public numMovePositions() : number {
		return this.moveKeys.length;
	}

	/**
	Finds the first name of format R[number] that is not in use, and returns it
	 */
	nameNewCubeType() : string {
		let i = 1;
		while (true) { //BAD PRACTICE :D
			if (!this.cube_types.some(r=>r.typeName == `CT${i}`)){
				return `CT${i}`;
			}
			i++;
		}
	}

	public getCubeType(i: number) : PolycubeCube{
		return this.cube_types[i];
	}

	public listCubeTypes() : PolycubeCube[]{
		return this.cube_types.map((ct: PolycubeCube) => ct.clone());
	}

	getCubeCoords() : Vector3[] {
		return [...this.cubes.keys()].map((s: string) => strToVec(s));
	}

	public cubeCoordsStrs() : string[] {
		return [...this.cubes.keys()];
	}

	/**
	@param move the move spot to check
	@param cube the rule to check
	Checks if a rule fits in a given move
	 */
    public fitCube(move: (null | {color, alignDir})[], cube: PolycubeCube) : PolycubeCube | false {
        let l = move.length;
        // Traverse rule and move faces in random order
        let ra = randOrdering(l, this.rng);
        let rb = randOrdering(l, this.rng);
        // For each face in the move...
        for (let ria=0; ria<l; ria++) {
            let i = ra[ria];
            // ...that is non-zero
            if (move[i] && move[i].color != 0) {
                // Check each face in cube type
                for (let rib=0; rib<l; rib++) {
                    let j = rb[rib];
					// skip inactive patches
                    if (!cube.patch_is_active(j)) {
						continue;
					}
                    // If we find an equal color
                    if (this.compatibleColors(move[i].color, cube.patches[j].color)) {
                        // Rotate rule so that the matching face has
                        // the same direction:
                        cube = cube.rotateSpeciesFromTo(
                            RULE_ORDER[j],
                            RULE_ORDER[i]);
                        console.assert(this.compatibleColors(move[i].color, cube.patches[i].color),
							`Move color ${move[i].color} does not match patch color ${cube.patches[i].color}`);

                        if (this.torsion) {
                            // ...and the same rotation:
                            cube = cube.rotateSpeciesAroundAxis(
                                RULE_ORDER[i],
                                -getSignedAngle(
                                    move[i].alignDir,
                                    cube.patches[i].alignDir,
                                    RULE_ORDER[i]
                                )
                            );
                            // console.assert(move[i].alignDir.distanceTo(rotated_cube.patches[j].alignDir) < 1e-5);
                        } else {
                            // ...and a random rotation:
                            cube = cube.rotateSpeciesAroundAxis(
                                RULE_ORDER[i],
                                Math.floor(this.rng() * 4) * Math.PI/2
                            );
                        }
						if (this.canPlaceCube(cube)){
							console.assert(this.compatibleColors(move[i].color, cube.patches[i].color));
							// Return the rotated rule b
							return cube;
						}
                    }
                }
            }
        }
        // Return false if we didn't find any matching faces
        return false;
    }

	/**
	 * Determines if a cube fits in a location
	 * @param c a cube, already rotated and translated
	 */
	public canPlaceCube(c: PolycubeCube) : boolean {
		let [connectionCount, mismatchCount] = this.countConnections(c);
		return connectionCount > 0 && (this.mismatches_allowed || mismatchCount == 0);
	}

	public countConnections(c: PolycubeCube) : [number, number] {
		let connectionCount = 0;
		let mismatchCount = 0;
		// loop directions
		RULE_ORDER.forEach((dir, i)=>{
			if (c.patches[i].color == 0){
				return;  // ignore zeroes
			}
			if (!c.patch_is_active(i)){
				return;
			}
			// compute adjacent position
			let adj = c.position.clone().add(dir);
			// if cube in adjacent position
			if (this.hasCube(adj)){
				let c2 = this.getCube(adj);
				let c2patch = c2.patches[RULE_ORDER.indexOf(dir.clone().negate())];
				if (c2patch.color == 0){
					return; // ignore zeroes
				}
				if (!c2.patch_is_active(RULE_ORDER.indexOf(dir.clone().negate()))){
					return;
				}
				if (this.compatibleColors(c2patch.color, c.patches[i].color)){
					if (!this.torsion || c2patch.alignDir.equals(c.patches[i].alignDir)){
						connectionCount++;
					}
					else {
						mismatchCount++;
					}
				}
				else {
					mismatchCount++;
				}
			}
		});
		return [connectionCount, mismatchCount];
	}
    
    /**
	@param move the move spot to check
	@param piece the piece to check
	Checks if a piece fits in a given move
	@todo: optimize this by pre-mapping possible pieces for any given color
	 */
    pieceFits(move: PolycubeMove, piece: PolycubeSystem) : false | PolycubeSystem  {
        // Traverse move faces and piece faces in random order
        let ra: number[] = randOrdering(move.speciesFit.length, this.rng);
        let rc: number[] = randOrdering(piece.moveKeys.length, this.rng);
        // For each face in the move...
        for (let ria=0; ria<move.speciesFit.length; ria++) {
            let i = ra[ria];
            // ...that is non-zero
            if (move.speciesFit[i] && move.speciesFit[i].color != 0) {
                // Check each face in rule
                for (let ric=0; ric<piece.moveKeys.length; ric++)
                {
					let k: number = rc[ric];
					let piece_move = piece.getMove(piece.moveKeys[k]);
					let rb = randOrdering(piece_move.speciesFit.length, this.rng);
			        for (let rib=0; rib<piece_move.speciesFit.length; rib++) {
			            let j = rb[rib];
			            if (!piece_move.speciesFit[j]){
							continue;
						}
						let valid_piece = this.testPieceMove(move, piece, i, j, k);
						if (valid_piece)
						{
							return valid_piece;
						}
					}
				}
			}
        }
        // Return false if we didn't find any matching faces
        return false;
    }
    /**
    @param move
    @param piece
    @param i the index of the face of the move (in this) being tested
    @param j the index of the face of the piece move being tested
    @param k the index of the piece move being tested
     */
    testPieceMove(move: PolycubeMove, piece: PolycubeSystem, i: number, j: number, k: number) : false | PolycubeSystem {
        // If we find an equal color
        let piece_move = piece.getMove(piece.moveKeys[k]);
        if (!this.compatibleColors(move.speciesFit[i].color, piece_move.speciesFit[j].color)) {
			return false;
		}

		// first, find the location of piece_move in the global space
		let global_translation = move.pos.clone();
//            let piece_translated = piece.translate(t_initial);
		//reposition the piece so that the cube that's the parent of piece_move[j]
		// is at 0,0,0
		let piece_translation = piece_move.pos.clone().add(RULE_ORDER[j]).negate();
		let piece_t = piece.translate(piece_translation);
		// Rotate the piece so that the matching face has
		// the same direction:
		let q = new THREE.Quaternion(); // create one and reuse it
		q.setFromUnitVectors(RULE_ORDER[j],
							 RULE_ORDER[i].clone().negate());
		let t_rot = new THREE.Matrix4().makeRotationFromQuaternion(q);
		let piece_rotated = piece_t.transform(t_rot);
		let rotated_move_key = piece_rotated.moveKeys[k]; //however move keys will of course be different
		let piece_move_rotated = piece_rotated.getMove(rotated_move_key);
		//now, reposition piece_rotated so that it lines up in the global space
		// moves should index the same way after applying a transformation - key word "should"
		// reindex j. use applyQuaternion(q) to avoid translating face vector
		let j_prime = RULE_ORDER.indexOf(RULE_ORDER[j].clone().applyQuaternion(q).round());
//            console.assert(rotated_move_key.clone().applyMatrix4(t).equals(move.pos));

		console.assert(this.compatibleColors(move.speciesFit[i].color,
											 piece_move_rotated.speciesFit[j_prime].color));
		let theta;
		if (this.torsion) {
			theta = -getSignedAngle(
				move.speciesFit[i].alignDir,
				piece_move_rotated.speciesFit[j_prime].alignDir,
				RULE_ORDER[i]
			);
//                console.assert(move[i].alignDir.distanceTo(rule_rotated.alignments[i]) < 1e-5);
		} else {
			// ...and a random rotation:
			theta = Math.floor(this.rng() * 4) * Math.PI/2;

		}
		if (theta) {
			q = new THREE.Quaternion().setFromAxisAngle(RULE_ORDER[i], theta);
			piece_rotated = piece_rotated.rotate(q);
//            console.assert(this.compatibleColors(move[i].color, rule_rotated.colors[i]));
			// Return the rotated rule b
		}
		// check for overlaps
		piece_rotated = piece_rotated.translate(global_translation);
		if ([...piece_rotated.cubes.keys()].some( (cube_position: string) => this.hasCube(cube_position))) {
			return false;
		}
		return piece_rotated;
  	}

	/**
	@param movekey a 3-length tuple (vector) representing the position to place a new cube
	@param cubeType the index of the rule to test at this location
	 */
    tryProcessSingleCubeMove(movekey: Vector3, cubeType: PolycubeCube): false | PolycubeCube {
		let cube: PolycubeCube | false = cubeType.instantiate(movekey.clone(), this.genCubeName());
		console.assert(this.hasMove(movekey))
        cube = this.fitCube(this.getMove(movekey).speciesFit, cube);
        if(cube) { // if a rule is identified that fits the move
        	// loop faces of the identified rule
            for (let i=0; i < RULE_ORDER.length; i++) {
                let neigb: null | {color, alignDir} = this.getMove(movekey).speciesFit[i]
                if (neigb != null) {
					// Josh Note: I think this next line of code is a bug. If we're checking for matches,
					// it should be this.compatibleColors(neighb.color, rule[i].color)
                    // if (neigb.color == rule[i].color && neigb.alignDir.equals(rule[i].alignDir)) {
					if (this.compatibleColors(neigb.color, cube.patches[i].color) && neigb.alignDir.equals(cube.patches[i].alignDir)){
                        this.matches++;
                        let parent_position: Vector3 = cube.position.clone();
						parent_position.add(RULE_ORDER[i]);
						console.assert(parent_position instanceof Vector3)
                        this.addConnection(cube, this.getCube(parent_position) , neigb.color);
                  
                    } else {
                        this.mismatches++;
                    }
                }
            }
            this.addParticle(cube);
            return cube;
        }
        return false;
    }
    
    tryProcessPieceMove(movekey: Vector3, piece: PolycubeSystem) : false | PolycubeSystem {
        let fitted_piece = this.pieceFits(this.getMove(movekey), piece);
        if(fitted_piece) { // if a rule is identified that fits the move
			[...fitted_piece.cubes.values()].forEach((c) => {
				let cube: PolycubeCube = c.instantiate(c.position, this.genCubeName());
				this.addParticle(cube);
				if (this.hasMove(c.position))
				{
					for (let i=0; i < RULE_ORDER.length; i++) {
		                let neigb = this.getMove(c.position).speciesFit[i]
		                if (neigb != null) {
							if (this.compatibleColors(neigb.color, cube.patches[i].color) && neigb.alignDir.equals(cube.patches[i].alignDir)){
		                        this.matches++;
		                        let parent_position = cube.position.clone().add(RULE_ORDER[i]);
		                        this.addConnection(cube, this.getCube(parent_position), neigb.color);
		                  
		                    } else {
		                        this.mismatches++;
		                    }
		                }
		            }
		            // Remove processed move
					this.moves.delete(vecToStr(c.position));
		            this.moveKeys.splice(this.moveKeys.indexOf(c.position), 1);
		        }
			});
            
        }
        return fitted_piece;
	}
	
	getValidPieces(move_key: Vector3, stage?) : AssemblyComponentList<PolycubeSystem>{
		if (stage == void 0){
			stage = this.current_stage;
		}
		let move = this.getMove(move_key);
		console.assert(move != void 0);
		let validPieces = new AssemblyComponentList<PolycubeSystem>(stage);
		move.forEachFace(f => {
			if (f && this.piecewise_staging[stage].hasColor(f.color)){
				this.piecewise_staging[stage].colormap[f.color].forEach(p => {
					if (!validPieces.in(p)){
						validPieces.add(p);
					}
				});
			}
		});
		return validPieces;
	}

	public run() {
		let hasNext;
		do {
			hasNext = this.step();
		} while (hasNext && this.numCubes() <= this.nMaxCubes);
	}

    public step (){
		if (this.moveKeys.length == 0){
			return false;
		}
		let result = false; //gotta deal with scoping problems
		// Pick a random move
		let key = this.moveKeys[Math.floor(this.rng()*this.moveKeys.length)];
		if (!this.isPiecewise())
		{
			// list allowed cube types
			let cube_types = this.allowedCubeTypes();
			// shuffle list
			cube_types = cube_types.shuffled(this.rng);
			// Check if we have a rule that fits this move
			result = false;
			while (cube_types.size() > 0) {
				let ct = cube_types.pop();
				let cube = this.tryProcessSingleCubeMove(key, ct);
				if (cube) {
					result = true;
					this.steps++;
					this.removeMove(key);
					break;
				}
			}
			if (!result){
				this.removeMove(key);
			}
		}
		else {
			let validPieces = this.getValidPieces(key);
			validPieces = validPieces.shuffled(this.rng);
			// let pieceIdxs = randOrdering(validPieces.length);
			// Check if we have a rule that fits this move
			result = false;
			while (validPieces.size() > 0) {
				let piece = validPieces.pop();
				let placed_piece = this.tryProcessPieceMove(key, piece);
				if (placed_piece) {
					result = true
					this.steps += placed_piece.numCubes();
					this.removeMove(key);
					break;
				}
			}

			// move keys will be automatically removed in piecewise assembly
			if (this.hasMove(key)) {
				// Remove processed move
				this.removeMove(key);
			}
		}
	}


	isProcessingComplete(){
		return this.moveKeys.length > 0 && this.cubes.size < this.nMaxCubes
	}

    /**
	 Need both rule and ruleIdx to determine color as the rule might be rotated
	 * @param cube_instance
	 */
    addParticle(cube_instance: PolycubeCube) {
        // Go through all non-zero parts of the rule and add potential moves
        // Josh Note: the system moves through the rule in a non-random order. is this an issue?
        	
        let position = cube_instance.position;
		let [connections, mismatches] = this.countConnections(cube_instance);
		// console.assert(connections > 0);
		console.assert(this.mismatches_allowed || mismatches == 0)

        this.cubes.set(vecToStr(position), cube_instance);
        
        this.currMinCoord = Math.min(this.currMinCoord, ...position.toArray());
        this.currMaxCoord = Math.max(this.currMaxCoord, ...position.toArray());

		// update moves for newly added particle
		this.updateMoves(cube_instance);

        this.cubeTypeCount[cube_instance.type_id]++;
		this.mismatches += mismatches;
		this.matches += connections;
    }

	randomCubeType(stage?: number | undefined) : PolycubeCube {
		if (typeof stage == "undefined"){
			stage = this.current_stage;
		}
		return this.staging[stage].r(this.rng);
	}

    /**
    updates the moves map after a cube is added or has its state change
     */
    updateMoves(cube: PolycubeCube) {
		let potentialMoves: {key: Vector3, dirIdx: number, color:number, alignDir:Vector3}[] = [];
		// loop faces
        for (let i_face = 0; i_face<RULE_ORDER.length; i_face++) {
			// check if patch has colorx
            if (!cube.patches[i_face].has_color()) {
                continue; // nothing to do here
            }
			// find move position
            let movePos: Vector3 = cube.position.clone().add(RULE_ORDER[i_face])
			// check if move is outside area limit
            if (Math.abs(movePos.x) > this.maxCoord ||
               Math.abs(movePos.y) > this.maxCoord ||
               Math.abs(movePos.z) > this.maxCoord)
            {
                // Neigbour outside of bounding box, stopping here
                continue;
            }

			// if there's a cube where the move would go
			if (this.hasCube(movePos)){
				// There is already a cube at pos,
				// no need to add this neigbour to moves
				continue;
			}

            let r = cube.position.clone().sub(movePos);
            console.assert(r.length() == 1, "Distance between cube and connected cube should always be 1 unit.")
			// compute direction index of move direction
            let dirIdx = RULE_ORDER.indexOf(r);
			console.assert(dirIdx >= 0)
            //if the face is not active
            if (!cube.patch_is_active(i_face))
            {
				// if move key is in moves, remove it
				if (this.hasMove(movePos) && this.getMove(movePos).speciesFit[dirIdx]) {
					// face in moves, should be removed now that it's inactive
					this.getMove(movePos).speciesFit[dirIdx] = null;
				}
				continue;
			}


			// if move key isn't currently in moves
            if (!this.getMove(movePos)) {
				//if there's not already a move in this position in the moves list,
				// add a new move to the moves list for this
                this.moves.set(vecToStr(movePos), new PolycubeMove(movePos));
                this.moveKeys.push(movePos);
            }

            //Make sure we haven't written anything here before:
			//Josh Note: this should never occur afaik so perhaps this should throw some sort of error?
			// console.assert(this.getMove(movePos).speciesFit[dirIdx] == null,
			// 	`There's somehow already a move in position${movePos} facing direction ${dirIdx}`)
			// console.assert(!this.getMove(movePos).speciesFit[dirIdx],
			// 	`Thing already written in 'this.moves[${vecToStr(movePos)}].speciesFit[${dirIdx}]' (not my code sorry.)`)

			//add move1%3A3%3A0%3A3%231%3A2%3A0%3A4%232%3A0%3A1%3A0%23%232%3A3%3A2%3A0%23%40%5B1%2C2%5D%3E3%3B%5B1%2C2%5D%3E4_-1%3A0%3A0%3A0%23%23-1%3A0%3A0%3A0%23%23-1%3A0%3A0%3A0%23_-2%3A3%3A0%3A2%23-2%3A3%3A0%3A3%23-2%3A0%3A0%3A4%23-2%3A2%3A0%3A5%23-3%3A0%3A1%3A0%23%40%5B1%5D%3E2%3B%5B1%5D%3E3%3B%5B1%5D%3E4%3B%5B1%5D%3E5_3%3A0%3A0%3A0%233%3A0%3A0%3A0%233%3A0%3A0%3A0%233%3A0%3A0%3A0%233%3A0%3A0%3A0%233%3A0%3A0%3A0
            potentialMoves.push({
                'key': movePos,
                'dirIdx': dirIdx,
                'color': cube.patches[i_face].color,
                'alignDir': cube.patches[i_face].alignDir
            });
        }

		// apply moves
        potentialMoves.forEach(i => {
			this.getMove(i.key).setFace(i.dirIdx, i.color, i.alignDir);
        });


	}

	getCubeObjects() : Mesh[] {
		return Object.entries(this.cubes).map((key, value: any) => {
			console.assert(! (value.cube_vis instanceof undefined))
			return value.cube_vis;
		});
	}
	
	resetMoves(){
		this.cubes.forEach((_, move_key)=>this.updateMoves(this.cubes.get(move_key)));
	}

	public removeMove(key: Vector3){
		this.moves.delete(vecToStr(key));
		this.moveKeys.splice(this.moveKeys.indexOf(key), 1);
	}

	/**
	 * lists possible orders in which we can add cube types
	 */
	getAllPossibleMoveOrders(stage?: number) : AssemblyComponentList<PolycubeCube>[][]{
		if (stage == void 0){
			stage = 0;
		}
		let cts = this.staging[stage];
		let num_cts = cts.size();
		let num_assembly_orders = num_cts ** this.maxPieceSize;
		//probably a better algorithm for this but i am too lazy to find it
		let assembly_order : AssemblyComponentList<PolycubeCube>[][] = [...range(num_assembly_orders)].map(
			() => [...range(this.maxPieceSize)].map(
				() => new AssemblyComponentList<PolycubeCube>(stage)
			)
		);

		// iter location indexes
		for (let iPos = 0; iPos < this.maxPieceSize; iPos++){
			let ct_idx = 0; // can NOT assume this indexes this.cube_types
			// iter assembly orders
			for (let i = 0; i < Math.pow(this.countAllowedCubeTypes(), this.maxPieceSize); i++){
				console.assert(assembly_order[i][iPos].size() == 0);
				assembly_order[i][iPos].add(cts.get(ct_idx));
				if (i % Math.pow(num_cts, iPos) == 0){
					ct_idx++;
				}
				if (ct_idx == this.countAllowedCubeTypes()){
					ct_idx = 0;
				}
			}

		}
		return assembly_order;
	}


	
	getReasonableOverlapTransforms(){
		let transforms = [];
		for (let x = this.currMinCoord; x <= this.currMaxCoord; x++) {
			for (let y = this.currMinCoord; y <= this.currMaxCoord; y++){
				for (let z = this.currMinCoord; z <= this.currMaxCoord; z++){
					transforms.push(new THREE.Vector3(x,y,z));
				}
			}
		}
		return transforms;
	}
	
	getLocationMap(regen=false) : Map<string, number> { //todo: better name
		if (regen) {
			this.regenerate();
		}
		let locmap = new Map<string, number>();
		this.cubes.forEach((v,k) => {
			locmap.set(k, v.type_id);
		});
		return locmap;
	}
	
	isEquivelent(other){
		if (this.cubes.size != other.cubeMap.size){
			return false;
		}
		if (this.cubeTypeCount.length == other.cubeTypeCount.length && !this.cubeTypeCount.equals(other.cubeTypeCount)) {
			return false;
		}
		let all_rotations = allRotations();
		let this_locmap = this.getLocationMap();
		let other_locmap = other.getLocationMap();
		let all_translations = this.getReasonableOverlapTransforms();
		for (let iRot = 0; iRot < all_rotations.length; iRot++){
			for (let iTran = 0; iTran < all_translations.length; iTran++){
				let t = new THREE.Matrix4();
				t.setFromMatrix3(all_rotations[iRot]);
				t.setPosition(all_translations[iTran]);
				 //gotta be clumsy with this because of scoping nonsense
				let found_deviation = false;
				this_locmap.forEach((v, k) =>{
					if (!found_deviation){ // workaround to break loop
						if (other_locmap.get(vecToStr(strToVec(k).applyMatrix4(t))) == v){
							found_deviation = true;
						}
					}
				});
				if (!found_deviation){
					return true;
				}
			}
		}
		return false;
	}
	
	transform(t: THREE.Matrix4) : PolycubeSystem{
		let copy = this.clone();
		console.assert(copy.cubes.size == this.cubes.size)
		copy.reset();
		[...this.cubes.values()].forEach((cube, _) => {
			let new_position = cube.position.clone().applyMatrix4(t).round();
			let q = new THREE.Quaternion().setFromRotationMatrix(t);
			copy.cubes.set(vecToStr(new_position), cube.rotate(q));
			copy.cubes.get(vecToStr(new_position)).position = new_position.clone();
		});
		copy.moves = new Map();
		copy.moveKeys = [];
		this.moveKeys.forEach((v, i) =>{
			copy.moveKeys[i] = v.clone().applyMatrix4(t).round();
			copy.moves.set(vecToStr(copy.moveKeys[i]), this.getMove(v).transform(t));
		});
		console.assert(copy.numCubes() == this.numCubes())
		return copy;
	}
	
	rotate(rot){
		if (rot instanceof THREE.Quaternion)
		{
			return this.transform(new THREE.Matrix4().makeRotationFromQuaternion(rot));
		}
		else if (rot instanceof THREE.Matrix3) {
			return this.transform(new THREE.Matrix4().setFromMatrix3(rot));
		}
		else {
			return this.transform(rot);
		}
	}
	
	translate (transl: Vector3): PolycubeSystem{
		return this.transform(new THREE.Matrix4().setPosition(transl));
	}
	
	getCurrentTopology() {
	    let bindings = [];
	    let empty = [];
	    let donePairs = [];  // Keep track so that only one bond per pair is saved
		let coords = [...this.confMap.keys()]
	    // For each position
	    coords.forEach((key, i)=> {
			let current = this.cubes[key]
			current.connections.forEach((conn, dPi)=>{
				if (!conn){
					return;
				}
				let other;
				if (conn.cube_1 == current) {
					other = conn.cube_2;
				}
				else {
					other = conn.cube_1;
				}
				let j = coords.findIndex(c=>c == other.position)
				if (!donePairs.includes([i,j].sort().toString())) {
					// add the connection of i and j by dP, dP * -1
                    bindings.push([
                        // Particle {} patch {} 
                        i, dPi,
                        // with Particle {} patch {}
                        j, dPi + (dPi % 2 == 0 ? 1 : -1) // equivelant of RULE_ORDER.idxOf(dP * -1)
                    ]);
                    //console.log(`Particle ${i} patch ${dPi} with particle ${j} patch ${dPi + (dPi % 2 == 0 ? 1 : -1)}`);
                    donePairs.push([i,j].sort().toString())
                }
                  else {
				// if there is no connection between coords[i] and coords[i] + dP...
				// add (i, dPi) to list of non-connections
				//... right?
                empty.push([i, dPi]);
           	 }
			});
		});
	    return [bindings, empty]
	}

	genCubeName() : string {
		let cube_name;
		do {
			cube_name = randstr(4, this.rng);
		} while (this.cube_name_map.has(cube_name));
		return cube_name;
	}


	/**
	 * Exports a polycube as a json file
	 */
    export() : {}
    {
		let json = {};
		json['cube_types'] = this.cube_types;
		json['cubes'] = [...this.cubes.entries()].map(([key, c])=>{
			return {
				"position": {
						"x": c.position.x,
					"y": c.position.y,
					"z": c.position.z
 				},
				"rotation": {
					"w": c.rotation.w,
					"x": c.rotation.x,
					"y": c.rotation.y,
					"z": c.rotation.z
				},
				"type": this.cube_types.findIndex(k=>k.typeName == c.typeName),
				"personal_name": c.personalName,
				"state": c.state
			};
		});
		json['tstep'] = this.steps;
		return JSON.stringify(json, null, 4);
	}

	// toGraph(){
	// 	let i = 0;
	// 	return {
	// 		nodes: [...this.cubeMap.keys()].map(key => {
	// 			return {
	// 				data: {
	// 					id: this.cubes[key].personalName,
	// 					cubeType: this.cubes[key].typeName,
	// 					coords: key
	// 				}
	// 			}
	// 		}),
	// 		edges: [
	// 			...this.connections.map(connection => {
	// 				return {
	// 					data: {
	//
	// 						source: connection.cube_1.personalName,
	// 						target: connection.cube_2.personalName
	// 					}
	// 				}
	// 			}),
	// 			...this.connections.map(connection => {
	// 				return {
	// 					data: {
	// 						id: `${connection.cube_2.personalName}-${connection.cube_1.personalName}`,
	// 						source: connection.cube_2.personalName,
	// 						target: connection.cube_1.personalName
	// 					}
	// 				}
	// 			})
	// 		]
	// 	}
	// }
}




