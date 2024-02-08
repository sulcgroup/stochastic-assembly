import * as THREE from "three";
import {Material, Mesh, MeshLambertMaterial, Object3D, Raycaster, SphereGeometry, Vector2, Vector3} from "three";
import * as $ from "jquery";
import {FACE_ROTATIONS, getNc, getNt, range, RULE_ORDER, saveString, selectColor, vectorAbs, vecToStr} from "../utils";
import DynamicPolycubeCube, {FACE_NAMES, parseDecRule, PolycubeCube, PolycubePatch, ruleToDec} from "../rule";
import deleteIcon from "../../ui/delete.svg";

import {initScene, render} from "../view";
import {Binding, SolveSpec} from "./solveSpec";
import {make_solver} from "./polycubeSolver";


let rollOverMesh, rollOverMaterial;
let cubeGeo, cubeMaterial;
let connectorGeo, connectoryMaterial;

let sphereGeo: SphereGeometry;

let CamPos3D;
let CamFov3D;

let voxels: Mesh[] = [];
let connectors: Map<any, any> = new Map();

let numNanoparticleTypes: number = 0;
let npTypeCounts: {} = {};
let activeNPType: number = -1;
let nanoparticles: {} = {}; // keys are position strings representing vectors, values are ints > -1
let nanoparticleObjects: {} = {};

let extraConnections: ExtraConnection[] = [];
let extraConnMap: {} = {}; // maps position strings to ExtraConnection objects

declare global {
    export interface Window {
        raycaster: Raycaster;
        mouse: Vector2;
    }
}

$("#addTypeBtn").on("click", addNanoparticleType);

$("#saveCoordMatrixBtn").on("click", saveCoordMatrix);
$("#saveSolveSpecBtn").on("click", saveSolveSpec)

$("#nanoparticle-select-none").on("click", ()=>setActiveNP(-1));

$("getFaRule").on("mouseover", (e)=>{
    (e.target as HTMLAnchorElement).href='../?decRule='+ruleToDec(getFullyAdressableRule());
});

$("#solveStructure").on("click", (e)=>{
    findMinimalRule();
});

initScene();
initSolver();
render();

$(function (){
    refreshCrystal();
})

// function posToString(p) : string{
//     return `[${p.toArray().toString()}]`;
// }

// b/c i'm deprecating 2D shapes
const posToString = vecToStr;

function addNanoparticleType() {
	let npidx = numNanoparticleTypes;
	let label = $(`<label for='np-${npidx}'>Type ${npidx}</label>`);
	let input = $(`<input name='nptype' type='radio' id='nanoparticle-select-type${npidx}' onclick='setActiveNP(${npidx})'>`);
	let rm = $(`<img src=${deleteIcon} style='height:14px;' alt='Remove' onclick='rmnptype(${npidx})'>`);
	let count = $(`<span id="npcount${npidx}">Count: 0</span>`)
	let span = $(`<span id='nptype${npidx}' style="background-color: ${selectColor(npidx)};"></span>`);
	span.append('<br>');
	span.append(label);
	span.append(input);
	span.append(count);
	span.append(rm);
	npTypeCounts[`${npidx}`] = 0;
	
	$("#nanoparticles").append(span);

	numNanoparticleTypes = numNanoparticleTypes + 1;
}

function setActiveNP(type_index: number){
	activeNPType = type_index;
}

function rmnptype(type_index: number){
	$(`#nptype${type_index}`).remove();
}

function constructNPMaterial(type_index: number){
	return new THREE.MeshLambertMaterial({
        color: selectColor(type_index)
    });
}

function connectionToString(p1: Vector3, p2: Vector3) : string {
    let [s1, s2] = [p1, p2].map(p=>posToString(p)).sort();
    return `[${s1}, ${s2}]`
}

function getCoordinateFile() {
    saveString(
        getCurrentCoords().map(p=>{return `(${p.x},${p.y},${p.z})`}).join('\n'), 
        'coords.txt'
    );
}

function getSolveSpec() : SolveSpec {
    let [topology, _] = getCurrentTop(3);
    let spec = new SolveSpec(topology);
    spec.torsion = $("#torsionalPatches").prop("checked");
    spec.assign_nS(species_range());
    spec.assign_nC(color_range());
    spec.forbid_self_interact = !$("#allowSelfInteract").prop("checked");
    if (numNanoparticleTypes > 0){
        getCurrentCoords().forEach((coords: Vector3, i: number) => {
            if (vecToStr(coords) in nanoparticles){
                spec.set_nanoparticle(nanoparticles[vecToStr(coords)], i);
            }
        })
    }
    if (extraConnections.length > 0) {
        spec.extraConnections = getExternalConnectionTop();
        if (extraConnections.some(c => c.breakscrystal())) {
            spec.crystal = false; // if the external connection doesn't produce a repeating crystal, flag it
        }
        // structures with external connections are assumed to be crystals unless we flag that above
    }
    spec.maxAltTries = <number>$("#nTries").val();
    return spec
}

function saveSolveSpec() {
    let out: SolveSpec = getSolveSpec();
    saveString(
        JSON.stringify(out),
        "polysat.json"
    );

    // let [topology, _] = getCurrentTop();
    // let out = {
    //     nDim: 3,
    //     bindings: topology,
    //     torsion: (document.getElementById("torsionalPatches") as HTMLInputElement).checked,
    //     stopAtFirst: (document.getElementById("stopAtFirstSol") as HTMLInputElement).checked
    // }
    // if (numNanoparticleTypes > 0){
	// 	[out["nanoparticles"], out["nNPTypes"]] = getNanoparticlePositions();
	// }
	// if (extraConnections.length > 0){
	// 	out["extraConnections"] = getExternalConnectionTop();
	// }
    // saveString(
    //     JSON.stringify(out),
    //     'polysat.json'
    // );
}

function loadSolveSpec(solveSpec) {
    // If we just have a default cube, remove it
    if (voxels.length == 1 && voxels[0].position.equals(new THREE.Vector3())) {
        let d = voxels[0];
        window.scene.remove(d);
        voxels.splice(0, 1);
    }
    // Load settings
    (document.getElementById("torsionalPatches") as HTMLInputElement).checked = solveSpec.torsion;
    (document.getElementById("stopAtFirstSol") as HTMLInputElement).checked = solveSpec.stopAtFirst;

    let coordMap = new Map();
    coordMap.set(0, new THREE.Vector3());
    let processedBindings = new Set();
    // binding processing while-loop
    while (processedBindings.size < solveSpec.bindings.length) {
        // iterate bindings
        for (const [i, dPi, j, dPj] of solveSpec.bindings) {
            const key = `${i}.${j}`;
            // if this connection has not already been processed...
            if (!processedBindings.has(key)) {
                // complain if bindings are weird
                console.assert(RULE_ORDER[dPi].clone().negate().equals(RULE_ORDER[dPj]), "Odd binding");
                // if both coordinates (i and j) are already mapped
                if(coordMap.has(i) && coordMap.has(j)) {
                    // Joakim wrote this assertion. I'm disabling it bc I don't
                    // know what it does and it always fires
                    // console.assert(
                    //     coordMap.get(i).clone().add(RULE_ORDER[dPi]).equals(coordMap.get(i)),
                    //     "Non-eucledian bindings!"
                    // );
                } else if (coordMap.has(i)) {
                    coordMap.set(j, coordMap.get(i).clone().add(RULE_ORDER[dPi]))
                } else if (coordMap.has(j)) {
                    coordMap.set(i, coordMap.get(j).clone().sub(RULE_ORDER[dPi]))
                } else {
                    console.log("should only print once");
                    continue;
                }
                processedBindings.add(key);
            }
        }
    }
    let center = new THREE.Vector3();
    let ncoords = 0;
    
    for (const x of coordMap.values()) {
        center.add(x);
        ncoords++;
    }
    center.divideScalar(ncoords).round();
    for (const x of coordMap.values()) {
        x.sub(center);
    }

    // init nanoparticle types
    if ("nNPTypes" in solveSpec){
		for (let i = 0; i < solveSpec["nNPTypes"]; i++){
			addNanoparticleType();
		}
	}

    // construct visual voxel
    for (const [i, x] of coordMap) {
        let voxel = new THREE.Mesh(cubeGeo, cubeMaterial.clone());
        voxel.position.copy(x);
        voxel.name = "voxel";
        if (voxels[i] === undefined) {
            window.scene.add(voxel);
            console.log(voxel.position.toArray());
            voxels[i] = voxel;
            // TODO: TEST
            if ("nNPTypes" in solveSpec){
				if (solveSpec["nNPTypes"] > 1) {
					if (`${i}` in solveSpec["nanoparticles"]){
						let nptype = solveSpec["nanoparticles"][`${i}`];
						addNanoparticle(voxel, nptype);
					}
				}
				else {
					if (i in solveSpec["nanoparticles"]){
						addNanoparticle(voxel, 0);
					}
				}
			}
        }
    }

    // install bindings
    for (const [i, dPi, j, dPj] of solveSpec.bindings) {
        let c1 = coordMap.get(i);
        let c2 = coordMap.get(j);
        let cs = connectionToString(c1, c2);
        if (!connectors.has(cs)) {
            let connector = new THREE.Mesh(connectorGeo, connectoryMaterial);
            connector.position.copy(c1.clone().add(c2).divideScalar(2));
            connector.lookAt(c2);
            window.scene.add(connector);
            connectors.set(cs, connector);
        }
    }

    // install crystalline bindings
    if ("extraConnections" in solveSpec){
        for (const [i, dPi, j, dPj] of solveSpec.extraConnections){
            addConnection(voxels[i], RULE_ORDER[dPi]);
            addConnection(voxels[j], RULE_ORDER[dPj]);
        }
    }
}

function handleFile(file = (document.getElementById('load') as HTMLInputElement).files[0]) {
    new Response(file).json().then(json => {
        loadSolveSpec(json);
      }, err => {
        console.error("Could not read file: "+ err);
    });
}

function handleDrop(ev) {
    ev.preventDefault();

    if (ev.dataTransfer.items) {
        for (const item of ev.dataTransfer.items) {
            if (item.kind === 'file') {
                handleFile(item.getAsFile());
            }
        }
    } else {
        for (const file of ev.dataTransfer.files) {
            handleFile(file);
        }
    }
}

function handleDragOver(ev) {
    console.log('File(s) in drop zone');

    // Prevent default behavior (Prevent file from being opened)
    ev.preventDefault();
}

function color_range() : [number, number] {
    return [
        <number>$("#minNc").val(),
        <number>$("#maxNC").val()
    ];
}

function species_range() : [number, number] {
    return [
        <number>$("#minNt").val(),
        <number>$("#maxNt").val()
    ];
}

function getFullyAdressableRule() : PolycubeCube[]{
    let rule : {color: number, alignDir: Vector3}[][] = [];
    let cubePosMap = new Map<string, number>();
    let coords = getCurrentCoords();

    // Find which dimension has the fewest connectors
    let dimCount = [0,0,0];
    let dims = [
        new THREE.Vector3(1,0,0),
        new THREE.Vector3(0,1,0),
        new THREE.Vector3(0,0,1)
    ];
    coords.forEach(p => {
        RULE_ORDER.forEach(dir => {
            let neigbourPos = p.clone().add(dir);
            if (connectors.has(`[${posToString(p)}, ${posToString(neigbourPos)}]`)) {
                for (let i=0; i<3; i++) {
                    if (vectorAbs(dir).equals(dims[i])) {
                        dimCount[i]++;
                        break;
                    }
                }
            }
        });
    });
    let minCount = Math.min(...dimCount);
    let minDim = dims.find((d,i)=>dimCount[i]===minCount);

    // Initialise empty cube typess
    coords.forEach((p,iCube) => {
        let cubeType = [];
        FACE_ROTATIONS.forEach((d,i)=>{
            let alignDir = d;
            if (!vectorAbs(RULE_ORDER[i]).equals(minDim)) {
                alignDir=minDim;
            }
            cubeType.push({color: 0, alignDir: alignDir});
        });
        rule.push(cubeType);
        cubePosMap.set(posToString(p), iCube);
    });
    let colorCounter = 1;
    coords.forEach((p, iCube) => {
        RULE_ORDER.forEach((dir, iFace)=>{
            let neigbourPos = p.clone().add(dir);
            if (connectors.has(`[${vecToStr(p)}, ${posToString(neigbourPos)}]`)) {
                const invDir = dir.clone().negate();
                const iFaceNeigh = RULE_ORDER.findIndex(f=>invDir.equals(f));
                const iCubeNeigh = cubePosMap.get(posToString(neigbourPos));
                rule[iCube][iFace].color = colorCounter;
                rule[iCubeNeigh][iFaceNeigh].color = -colorCounter;
                rule[iCubeNeigh][iFaceNeigh].alignDir = rule[iCube][iFace].alignDir;

                colorCounter++;
            }
        })
    });
    return rule.map((ct, i) => {
        return new DynamicPolycubeCube(i, ct.map((patch, j) => {
            return new PolycubePatch(patch.color, j, patch.alignDir);
        }));
    });
}

function getCurrentCoords() : Vector3[]{
    return voxels.map(v=>v.position);
}

function initSolver() {
    // roll-over helpers
    let rollOverGeo = new THREE.BoxGeometry(.5, .5, .5);
    rollOverMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        opacity: 0.5,
        transparent: true
    });
    rollOverMesh = new THREE.Mesh(rollOverGeo, rollOverMaterial);
    window.scene.add(rollOverMesh);

    // cubes
    cubeGeo = new THREE.BoxGeometry(.75, .75, .75);
    cubeMaterial = new THREE.MeshLambertMaterial({
        color: 0x444444
    });

    // cubes
    connectorGeo = new THREE.BoxGeometry(.45, .45, .5);
    connectoryMaterial = new THREE.MeshLambertMaterial({
        color: 0xfe004c
    });
    
    // nanoparticles
    sphereGeo = new THREE.SphereGeometry(.35, 32,16);

    window.raycaster = new THREE.Raycaster();
    window.mouse = new THREE.Vector2();

    window.canvas.addEventListener('mousemove', onDocumentMouseMove, false);
    window.canvas.addEventListener('mousedown', onDocumentMouseDown, false);

    // window.addEventListener('resize', onWindowResize, false);

    document.addEventListener("keydown", event => {
        if (event.key == 's' && event.ctrlKey) {
            event.preventDefault();
            this.getCoordinateFile();
        }
    });

    let voxel = new THREE.Mesh(cubeGeo, cubeMaterial.clone());
    window.scene.add(voxel);
    voxels.push(voxel);

    CamPos3D = new THREE.Vector3(5, 8, 13);
    CamFov3D = 45;
    // toggle2DCamera();
}

function largestComponent(v) {
    if (Math.abs(v.x) >= Math.abs(v.y) && Math.abs(v.x) >= Math.abs(v.z)) {
        return new THREE.Vector3(1,0,0).multiplyScalar(Math.sign(v.x));
    }
    if (Math.abs(v.y) >= Math.abs(v.x) && Math.abs(v.y) >= Math.abs(v.z)) {
        return new THREE.Vector3(0,1,0).multiplyScalar(Math.sign(v.y));
    }
    if (Math.abs(v.z) >= Math.abs(v.y) && Math.abs(v.z) >= Math.abs(v.x)) {
        return new THREE.Vector3(0,0,1).multiplyScalar(Math.sign(v.z));
    }
}

// function toggle2DCamera() {
//     const is2d = (document.getElementById("2d") as HTMLInputElement).checked;
//     if (is2d) {
//         camera.fov = 1/100;
//         camera.zoom = 1/1000;
//         CamPos3D.copy(camera.position);
//         camera.position.x = 0;
//         camera.position.y = 0;
//     } else {
//         camera.fov = CamFov3D;
//         camera.zoom = 1;
//         camera.position.copy(CamPos3D);
//     }
//     camera.lookAt(new THREE.Vector3());
//     camera.updateProjectionMatrix();
//     render();
// }

function onDocumentMouseMove(event) {
    event.preventDefault();
    window.mouse.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    window.raycaster.setFromCamera(window.mouse, window.camera);

    let intersects = window.raycaster.intersectObjects(voxels);
    if (intersects.length > 0) {
        rollOverMesh.visible = true;
        let intersect = intersects[0];
        rollOverMesh.position.copy(intersect.object.position);
        if (event.shiftKey) {
            rollOverMesh.scale.setScalar(2);
        } else {
            rollOverMesh.scale.setScalar(1);
            // if ((document.getElementById("2d") as HTMLInputElement).checked) {
            //     const dir = intersect.point.clone().sub(intersect.object.position);
            //     dir.z = 0;
            //     rollOverMesh.position.add(largestComponent(dir).divideScalar(2));
            // } else {
                rollOverMesh.position.add(intersect.face.normal.clone().divideScalar(2));
            // }
        }
    } else {
        rollOverMesh.visible = false;
    }
    render();
}

/**
triggered when the user clicks the mouse
 */
function onDocumentMouseDown(event) {
    if (event.button == 0) {
        event.preventDefault();
        window.mouse.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
        window.raycaster.setFromCamera(window.mouse, window.camera);
        let intersects = window.raycaster.intersectObjects(voxels);
        if (intersects.length > 0) {
            let i = intersects[0];

            // delete cube
            if (event.shiftKey) {
                if (voxels.length > 1) {
                    // Remove cube
                    window.scene.remove(i.object);
                    voxels.splice(voxels.indexOf(i.object as Mesh),1);
                    // Remove connectors
                    let connectorsToRemove = [];
                    connectors.forEach((c,s)=>{
                        if(s.includes(posToString(i.object.position))) {
                            connectorsToRemove.push([c,s]);
                        }
                    })
                    console.log(`Removing ${connectorsToRemove.length} connectors: ${connectorsToRemove.map(c=>c[1])}`)
                    connectorsToRemove.forEach(i=>{
                        let [c,s] = i;
                        window.scene.remove(c);
                        connectors.delete(s);
                    });
                }
			// add nanoparticle
            } else if (event.altKey) {
				// if the user is placing a nanoparticle type
                if (activeNPType > -1){
					// if an existing nanoparticle is at this positon (replacing)
					if (vecToStr(i.object.position) in nanoparticles){
						nanoparticles[vecToStr(i.object.position)] = activeNPType;
						nanoparticleObjects[vecToStr(i.object.position)].material = constructNPMaterial(activeNPType);
						let rmvingType = nanoparticles[vecToStr(i.object.position)];
						// decrement count of np type being replaced
						npTypeCounts[`${rmvingType}`]--;
						$(`#npcount${rmvingType}`).text("Count:" + npTypeCounts[`${rmvingType}`]);
						npTypeCounts[`${activeNPType}`]++;
						$(`#npcount${activeNPType}`).text("Count:" + npTypeCounts[`${activeNPType}`]);
					}
					// if no nanoparticle is already at this position
					else {
						addNanoparticle(i.object, activeNPType);
					}
				}
				// if the user is clearing a nanoparticle
				else {
					if (vecToStr(i.object.position) in nanoparticles){
						let rmvingType = nanoparticles[vecToStr(i.object.position)];
						delete nanoparticles[vecToStr(i.object.position)];
						window.scene.remove(nanoparticleObjects[vecToStr(i.object.position)]);
						delete nanoparticleObjects[vecToStr(i.object.position)];
                        ((i.object as Mesh).material as MeshLambertMaterial).transparent = false;
                        ((i.object as Mesh).material as MeshLambertMaterial).opacity = 1.0;
						npTypeCounts[`${rmvingType}`]--;
						$(`#npcount${rmvingType}`).text("Count:" + npTypeCounts[`${rmvingType}`]);
					}
				}
                
	        // create add connection
			} else if (event.ctrlKey) {
				addConnection(i.object as Mesh, i.face.normal);
			// create cube
			} else {
                let voxel = new THREE.Mesh(cubeGeo, cubeMaterial.clone());
                voxel.position.copy(i.object.position);
                voxel.position.add(i.face.normal);
                voxel.name = "voxel";
                let existing = false;
                for (let v of voxels) {
                    if (v.position.equals(voxel.position)) {
                        console.log("Position already set");
                        voxel = v;
                        existing = true;
                        break;
                    }
                }
                if (!existing) {
                    window.scene.add(voxel);
                    console.log(voxel.position.toArray());
                    voxels.push(voxel);
                }

                // Add connector, unless we are drawing in third dimension
                // when we shouldn't
                let c1 = voxel.position.clone();
                let c2 = i.object.position.clone();

                // todo: 2d compatibility?
                let is2d = false

                if(!is2d || !c1.equals(c2)) {
                    let cs = connectionToString(c1, c2);
                    if (!connectors.has(cs)) {
                        let connector = new Mesh(connectorGeo, connectoryMaterial);
                        connector.position.copy(c1.clone().add(c2).divideScalar(2));
                        connector.lookAt(c2);
                        window.scene.add(connector);
                        connectors.set(cs, connector);
                    }
                }
            }
            render();
        }
    }
}

function addNanoparticle(voxel: Object3D, iType: number){
    let sphereGeo = new THREE.SphereGeometry(.35, 32,16);
    let np = new Mesh(sphereGeo, constructNPMaterial(iType));
	np.position.copy(voxel.position);
	nanoparticleObjects[vecToStr(voxel.position)] = np;
	nanoparticles[vecToStr(voxel.position)] = iType;
    ((voxel as Mesh).material as Material).transparent = true;
    ((voxel as Mesh).material as Material).opacity = 0.55;
	window.scene.add(np);
	npTypeCounts[`${iType}`]++;
	$(`#npcount${iType}`).text("Count:" + npTypeCounts[`${iType}`]);
}

class ExtraConnection{
    public c1: Vector3;
    public d1: Vector3;
    public c2: Vector3;
    public d2: Vector3;

    public m1: Mesh;
    public m2: Mesh;
    public readonly idx: number;
	constructor(c1, d1, c2=null, d2=null){
		this.c1 = c1;
		this.d1 = d1.clone().normalize();
		this.c2 = c2;
		this.d2 = d2 != null ?  d2.clone.normalize() : null;
		this.idx = extraConnections.length;
	}
	toString(){
		let [[c1, d1], [c2, d2]] = [
            [this.c1, this.d1], [this.c2, this.d2]
        ].sort((a: [Vector3, Vector3], b: [Vector3, Vector3]) => {
            return a[0].length() - b[0].length();
        });
		return `${vecToStr(c1)}:${FACE_NAMES[RULE_ORDER.indexOf(d1)]}<->${vecToStr(c2)}:${FACE_NAMES[RULE_ORDER.indexOf(d2)]}`;	
	}
	full(): boolean {return this.c2 != null;}
	getMaterial() : MeshLambertMaterial {
        return new MeshLambertMaterial({color: selectColor(this.idx + 1)});
    }
	breakscrystal() : boolean {
		return this.d2 != null && !this.d1.clone().multiplyScalar(-1).equals(this.d2);
	}
}

function addConnection(voxel: THREE.Mesh, dir: Vector3){
	let connector = new THREE.Mesh(connectorGeo);
	connector.lookAt(dir);
	connector.position.copy(voxel.position.clone().add(dir.clone().divideScalar(2)));
	
	// if connection is currently in progress
	if (extraConnections.length > 0 && !extraConnections[extraConnections.length - 1].full()){
        let connobj = extraConnections[extraConnections.length - 1];
		if (connobj.c1.equals(voxel.position) && connobj.d1.equals(dir.clone().normalize())){
            // if I've accidentally tried to add a connection to the same face of the same particle twice
			return;
		}
        connobj.c2 = voxel.position.clone();
        connobj.d2 = dir.clone().normalize();
        connobj.m2 = connector;
	}
	else {
		extraConnections.push(new ExtraConnection(voxel.position.clone(), dir));
		extraConnections[extraConnections.length - 1].m1 = connector;
	}
	let connobj = extraConnections[extraConnections.length - 1];
	connector.material = connobj.getMaterial();
	window.scene.add(connector);
	
	if (connobj.full()){
		let span = $(`<span id="connection${connobj.idx}">${connobj.toString()}
		<img src='../../ui/delete.svg' style='height:14px;' alt='Remove' onclick='rmConn(${connobj.idx})'></span>`);
		if (connobj.breakscrystal()){
			span.append($(`<img src="../../ui/warning.svg" alt="Warning!" style='height:14px;'>`));
		}
		span.append($("<br>"));
		$("#connections").append(span)
		extraConnMap[vecToStr(voxel.position)] = connobj;
	}
	refreshCrystal();
	render();
}

function rmConn(idx){
	let conn = extraConnections[idx];
	extraConnections.splice(idx, 1);
	$(`#connection${idx}`).remove();
	window.scene.remove(conn.m1);
	window.scene.remove(conn.m2);
	delete extraConnMap[vecToStr(conn.c1)];
	delete extraConnMap[vecToStr(conn.c2)];
	render();
	refreshCrystal();
}

function refreshCrystal(){
	let problemConnections = extraConnections.filter(c=>c.breakscrystal());
	if (problemConnections.length == 0){
		$("#willcrystal").text("No bad connections! May or may not form crystal (no promises).");
	}
	else {
		$("#willcrystal").text("Will not form crystal - bad connections " + problemConnections.map(c=>c.toString()).join(",") + ".");
	}
}

/**
creates an array of all x,y pairs between the specified mins and maxs,
then sorts by the difference of a[x]+a[y] and b[x] + b[y]
so the lowest x + y value first, ascending to the highest x+y value
minimums default to 1 if unspecified
*/
function smartEnumerate(xMax, yMax, xMin=1, yMin=1) : [number, number][] {
    let l = []
    for (const x of range(xMin, xMax+1)) {
        for (const y of range(yMin, yMax+1)) {
            l.push([x,y])
        }
    }
    return l.sort((a,b)=>{return (a[0]+a[1]) - (b[0]+b[1])})
}


/**
returns the connection map of the current topology
as a set of 4-length vectors [i, dPi, j, dPi']
where (assuming nDim=3):
	i = the index of a coordinate vector (x, y, z) in getCurrentCoords()
	dPi = the index of a direction vector in getRuleOrder(nDim) that is coords[i] - coords[j]
		 (or possibly vice versa?)
	j = the index of another coordinate vector (x', y', z') in getCurrentCoords() where
		a connection exists between the cube at coords[i] and coords[j]
	dPi' = the index of a direction vector in getRuleOrder(nDim) that is coords[j] - coords[i]
		(or possibly vice versa?), aka RULE_ORDER.indexOf(RULE_ORDER[dPi] * -1)
also returns empty, which is a list of all (i, dPi) where no connection exists between i
and the cube at coords[i] + RULE_ORDER[dPi]
 */
function getCurrentTop(nDim=3) : [Binding[], [number, number][]] {
    console.assert(nDim == 3)
    let neigbourDirs = RULE_ORDER;
    let bindings: Binding[] = [];
    let empty = [];
    let donePairs = [];  // Keep track so that only one bond per pair is saved
    let connectionStrs = [...connectors.keys()]; // set of all connections in this system
    let coords = getCurrentCoords();
    coords.forEach((current, i)=>{
        // Enumerate von Neumann neighborhood
        neigbourDirs.forEach((dP,dPi)=>{
            let neigbourPos: Vector3 = current.clone().add(dP);
            // check if this system contains a connection between coords[i] and coords[i] + dP
            if (connectionStrs.includes(connectionToString(current, neigbourPos))) {
				// let j = the index of the position of current.neighbor[dP] in coords
                let j = coords.findIndex(c=>c.equals(neigbourPos));
                // if j is in the set of connections but not the set of coordinates, something is wrong
                if (j<0) {
                    throw `${neigbourPos} not in coordinates (${coords})`;
                }
                // if no form of the connection between coords[i] and coords[j]
                // is already in the list of pairs:
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
            } else {
				// if there is no connection between coords[i] and coords[i] + dP...
				// add (i, dPi) to list of nataon-connections
				//... right?
                empty.push([i, dPi]);
            }
        });
    });
    return [bindings, empty]
}

/**
returns the connection map of the current topology
as a set of 4-length vectors [i, dPi, j, dPi']
where (assuming nDim=3):
	i = the index of a coordinate vector (x, y, z) in getCurrentCoords()
	dPi = the index of a direction vector in getRuleOrder(nDim) that is coords[i] - coords[j]
		 (or possibly vice versa?)
	j = the index of another coordinate vector (x', y', z') in getCurrentCoords() where
		a connection exists between the cube at coords[i] and coords[j]
	dPi' = the index of a direction vector in getRuleOrder(nDim) that is coords[j] - coords[i]
		(or possibly vice versa?), aka RULE_ORDER.indexOf(RULE_ORDER[dPi] * -1)
also returns empty, which is a list of all (i, dPi) where no connection exists between i
and the cube at coords[i] + RULE_ORDER[dPi]
 */
function getExternalConnectionTop(nDim=3) : Binding[]{
    let coords = getCurrentCoords();
    return extraConnections.map(conn=>{
       return [
           coords.findIndex(k=>conn.c1.equals(k)),
           RULE_ORDER.indexOf(conn.d1),
           coords.findIndex(k=>conn.c2.equals(k)),
           RULE_ORDER.indexOf(conn.d2)
       ]
    });
}

function getNanoparticlePositions() : [number[] | {}, number]{
	let coords = getCurrentCoords();
	let nanoparticlePositions;
	if (numNanoparticleTypes > 1){
		nanoparticlePositions = {};
	}
	else {
		nanoparticlePositions = [];
	}
	let realNumTypes: number = numNanoparticleTypes;
    coords.forEach((current, i)=>{
		if (vecToStr(current) in nanoparticles){
			if (numNanoparticleTypes > 1){
				nanoparticlePositions[`${i}`] = nanoparticles[vecToStr(current)];
			}
			else {
				nanoparticlePositions.push(i);
			}
		}
	});
	// remove nanoparticle types with no instances
	// inefficiant algorithm but i'm too tired to write a better one
	for (let npt = 0; npt < numNanoparticleTypes; npt++){
		if (npTypeCounts[npt] == 0){
			realNumTypes--;
			if (numNanoparticleTypes > 1){
				Object.keys(nanoparticlePositions).forEach(key=>{
					if (nanoparticlePositions[key] > npt)
					{
						nanoparticlePositions[key]--;
					}
				});
			}
			else {
				nanoparticlePositions = nanoparticlePositions.map(i=>{
					return i-1 ? i > npt : i;
				});
			}
		}
	}
	return [nanoparticlePositions, realNumTypes];
}

/**
 */
function saveCoordMatrix(){
	var xs = [];
	var ys = [];
	var zs = [];
	getCurrentCoords().forEach(c=>{
		xs.push(c.x);
		ys.push(c.y);
		zs.push(c.z);
	});
	let coordstring = "";
	coordstring += xs.join(" ") + "\n";
	coordstring += ys.join(" ") + "\n";
	coordstring += zs.join(" ");
	saveString(coordstring, "coords_matrix.txt");
} 

function topFromCoords(coords, nDim=3) : [Binding[], [number, number][]] {
    let neigbourDirs = RULE_ORDER;

    let bindings = [];
    let empty: [number, number][] = [];
    let donePairs = [];  // Keep track so that only one bond per pair is saved

    // For each position
    coords.forEach((current, i)=> {
        // Enumerate von Neumann neighborhood
        neigbourDirs.forEach((dP,dPi)=>{
            let neigbourPos = current.clone().add(dP);
            let found = false;
            // Check if curerent neighbor is among the positions
            coords.forEach((other,j)=>{
                if (neigbourPos.equals(other)) {
                    if (!donePairs.includes([i,j].sort().toString())) {
                        bindings.push([
                            // Particle {} patch {} 
                            i, dPi,
                            // with Particle {} patch {}
                            j, dPi + (dPi % 2 == 0 ? 1 : -1)
                        ])
                        console.log(`Particle ${i} patch ${dPi} with particle ${j} patch ${dPi + (dPi % 2 == 0 ? 1 : -1)}`)
                        donePairs.push([i,j].sort().toString())
                    }
                    found = true;
                }
            });
            // If the current neigbour is empty, save
            if (!found) {
                empty.push([i, dPi])
            }
        });
    });
    return [bindings, empty]
}

/**
returns the maximum possible number of colors and cube types that would satisfy the topology
specified here
probably?
*/
function countParticlesAndBindings(topology) {
    let pidsa = topology.map(x=>x[0]); //indexes of first coord in each topology entry
    let pidsb = topology.map(x=>x[2]); //indexes of second coord in each topology entry
    let particles = pidsa.concat(pidsb);
    // return a 2ple of the total number of particles and the total number of bonds between particles
    return [Math.max(...particles)+1, topology.length]
}


/**
Calculates minimal "rule" (set of cubes/colors) that satisfies the inputted topology
 */
function findMinimalRule(nDim=3, torsionalPatches=true) {
    // Clear status
    document.getElementById('status').innerHTML = ''; //clear status
    // read min and max colors and cubes as specified by user
    let maxCubeTypes = (document.getElementById('maxNt') as HTMLInputElement).valueAsNumber;
    let maxColors = (document.getElementById('maxNc') as HTMLInputElement).valueAsNumber;
    let minCubeTypes = (document.getElementById('minNt') as HTMLInputElement).valueAsNumber;
    let minColors = (document.getElementById('minNc') as HTMLInputElement).valueAsNumber;

    // Never need to check for more than the topology can specify
    // Calc fully adressable rule:
    const fullyAdressable = getFullyAdressableRule();
    let [topology, _] = getCurrentTop(nDim);
    let [maxNT, maxNC] = countParticlesAndBindings(topology);
    if ($("#explicitNcNs").prop("checked")){
        console.warn("User-defined nC and nS not supported yet!")
    }
    updateStatus({status:'✓', rule: ruleToDec(fullyAdressable)}, maxNT, maxNC);

    // Try to simplify:
    let simplifyWorker = new Worker(new URL('../simplifyWorker.ts', import.meta.url), { type: 'module' });
    simplifyWorker.onmessage = function(e) {
        const simplified = e.data;
        const simplifiedRule = parseDecRule(simplified);
        const nCubeTypes = getNt(simplifiedRule);
        const nColors = getNc(simplifiedRule);
        updateStatus({status:'✓', rule: simplified}, nCubeTypes, nColors);
        globalBest = Math.min(globalBest, nCubeTypes+nColors);
    }
    simplifyWorker.postMessage(ruleToDec(fullyAdressable));

    maxCubeTypes = maxCubeTypes < 0 ? maxNT : Math.min(maxNT, maxCubeTypes);
    maxColors = maxColors < 0 ? maxNC : Math.min(maxNC, maxColors);

	// create empty array for solve workers
    workers = [];
    // add stop button
    let stopButton = document.getElementById("stopButton");
    // function to stop all solve workers when stop button clicked
    stopButton.onclick = ()=>{
        workers.forEach(w=>{
            w.terminate();
            updateStatus({status:'↛'}, w.nCubeTypes, w.nColors);
        });
        stopButton.style.visibility = 'hidden'
    };
    //create a list of x,y values for cubetype, color sorted from lowest to highest
    //cubetype, color.
    queue = smartEnumerate(maxCubeTypes, maxColors, minCubeTypes, minColors);
    // set maximum number of concurrent workers, in order to minimize computational
    // insanity
    const nConcurrent: number = parseInt($("#concurrency").val() as string);
    globalBest = Infinity;
    root_spec = getSolveSpec();
    // one assumes this will always be true? idk
    if (window.Worker) {
		// while there's a spot for another worker
        while (workers.length < nConcurrent) {
			// if there are more computations to run
            if (queue.length > 0) {
				// add ano`ther worker
                startNewWorker();
            } else {
                break;
            }
        }
    }
}

let root_spec: SolveSpec;
let globalBest;
let queue: [number, number][], workers;
class SATWorker extends Worker {
    public nCubeTypes: number;
    public nColors: number;
}

function startNewWorker() {
    const [nCubeTypes, nColors] = queue.shift(); // Get next params
    let spec = root_spec.cpy();
    spec.assign_nC(nColors);
    spec.assign_nS(nCubeTypes);

    updateStatus({status:'...'}, nCubeTypes, nColors);

    //updateStatus('...', nCubeTypes, nColors);
    console.log("Starting worker for "+nCubeTypes+" and "+nColors);
    let myWorker = new SATWorker(new URL("solveWorker.ts", import.meta.url), {type: "module"}); // simple worker script which calls find_solution
    myWorker.nCubeTypes = nCubeTypes;
    myWorker.nColors = nColors;
    workers.push(myWorker);
    // set behavior when worker is done working
    myWorker.onmessage = function(e) {
		//grab results
        let result = e.data;
        // tell us what happened
        updateStatus(result, nCubeTypes, nColors);
        // tell us more what happened
        if (result.status == '✓' && (document.getElementById('stopAtFirstSol') as HTMLInputElement).checked) {
            globalBest = Math.min(globalBest, nCubeTypes+nColors); //update best arrangement
            // kill all workers that won't beat this score
            workers.forEach(w=>{
                if (w.nCubeTypes + w.nColors > globalBest) {
                    updateStatus({status:'↛'}, w.nCubeTypes, w.nColors);
                    w.terminate();
                    console.log(`Skipping ${nColors} colors and ${nCubeTypes} cube types`)
                }
            });
            // remove workers that have come up with worse values than the best
            filterInPlace(workers, w=>(w.nCubeTypes + w.nColors <= globalBest));
            // purge queue of calculations that won't do better than this one
            filterInPlace(queue, p=>(p[0] + p[1] <= globalBest));
        }
        // if there are more sets in the queue, start another one
        if (queue.length > 0) {
			// LET THE WORKER COMMENCE
            startNewWorker();
        }
        myWorker.terminate();
        filterInPlace(workers, w=>w!=myWorker); // Remove from workers
        console.log(`${nColors} colors and ${nCubeTypes} cube types completed. ${queue.length} in queue`);
    }
    let obj = JSON.parse(JSON.stringify(spec));
    myWorker.postMessage(make_solver    (obj));
    // myWorker.postMessage([topology, empty, nCubeTypes, nColors, nDim, torsionalPatches]);
}

// https://stackoverflow.com/a/37319954
// filters an array in place
function filterInPlace<T>(a: T[], condition) : T[] {
    let i = 0, j = 0;
  
    while (i < a.length) {
      const val = a[i];
      if (condition(val, i, a)) a[j++] = val;
      i++;
    }
  
    a.length = j;
    return a;
  }

function updateStatus(result: any, nCubeTypes: number, nColors: number) {
    let captions = {
        '✓': `Satisfiable for ${nCubeTypes} cube types and ${nColors} colors`,
        '∞': `Satisfiable for ${nCubeTypes} cube types and ${nColors} colors, but will also assemble into unbounded shapes`,
        '?': `Satisfiable for ${nCubeTypes} cube types and ${nColors} colors, but will also assemble into other shapes`,
        '×': `Not satisfiable for ${nCubeTypes} cube types and ${nColors} colors`,
        '...': `Working on it...`,
        '↛': 'Skipped'
    }
    let colors = {
        '✓': 'rgba(126, 217, 118, 0.6)',
        '∞': 'rgba(39, 61, 128, 0.6)',
        '?': 'rgba(39, 61, 128, 0.6)',
        '×': 'rgba(208, 47, 47, 0.6)',
        '...': 'rgba(50, 50, 50, 0.4)',
        '↛': 'rgba(50, 50, 50, 0.4)'
    }
    let table = document.getElementById('status') as HTMLTableElement;
    while (table.rows.length < nCubeTypes+1) {
        table.insertRow();
    }
    while (table.rows[0].cells.length < nColors+1) {
        let c = document.createElement("th");
        table.rows[0].appendChild(c);
        if (table.rows[0].cells.length != 1) {
            c.innerHTML = 'N<sub>c</sub>='+(table.rows[0].cells.length-1);
        }
    }
    let row = table.rows[nCubeTypes];
    if (row.cells.length == 0) {
        let c = document.createElement("th");
        row.appendChild(c);
        c.innerHTML = 'N<sub>t</sub>='+nCubeTypes;
    }
    while (row.cells.length < nColors+1) {
        row.insertCell();
    }
    let cell = row.cells[nColors];
    if (result.rule) {
        cell.innerHTML = `<a href="../?assemblyMode=stochastic&decRule=${result.rule}" target="_blank">${result.status}</a>`;
    } else if (result.status == '...') {
        cell.innerHTML = '<div class="busy">...</div>';
    } else {
        cell.innerHTML = result.status;
    }
    cell.title = captions[result.status];
    cell.style.background = colors[result.status];
}
