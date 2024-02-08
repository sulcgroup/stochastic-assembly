import * as THREE from "three";
import {downloadStructure} from "./libs";
import * as $ from "jquery";
import {PolycubeSystem} from "./polycubeSystem";
import {cubeTypeColor, patchColor, PolycubeCube} from "./rule";
import {
    Camera,
    LineBasicMaterial,
    Mesh,
    MeshLambertMaterial,
    Raycaster,
    Scene,
    Vector2,
    Vector3,
    WebGLRenderer
} from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {vecToStr} from "./utils";


// subclass of PolycubeSystem specifically for rendering
export class VisualPolycubeSystem extends PolycubeSystem {
    // physical size of cube
    private cubeSize: number;
    // link to UI environment browser

    envbrowser: JQuery<HTMLElement>;

    // graphics geometry object for cube-cube connector

    private connectorCubeGeo: THREE.BoxGeometry;
    private centerCubeGeo: THREE.BoxGeometry;
    private connectorLineMaterial: LineBasicMaterial;

    private particleColors: any[];

    centerOfMass: THREE.Vector3;


    private lineGroup: THREE.Group;

    particleMaterials: any;
    colorMaterials: any[];

    private connectorPointerGeo: THREE.BoxGeometry;

    // factor by which to scale up the visualization between normal vs. line view???
    private lineViewFactor: number;

    constructor(scene,
                nMaxCubes=1000,
                maxCoord=100,
                buildConfmap=true,
                torsion = true,
                envbrowser=$("<div>"),
                maxPieceSize=1,
                rand_seed: string = "abcd") {

        super(nMaxCubes, maxCoord, buildConfmap, torsion, maxPieceSize, rand_seed);

        this.colorMaterials = [];
        this.particleColors = [];

        this.cubeSize = 0.7;

        this.objGroup = new THREE.Group();
        this.lineGroup = new THREE.Group();
        this.lineGroup.visible = false;

        scene.add(this.objGroup);
        scene.add(this.lineGroup);
        this.centerOfMass = new Vector3(0, 0, 0);

        let connectorCubeSize = (1-this.cubeSize);
        this.connectorCubeGeo = new THREE.BoxGeometry(
            connectorCubeSize, connectorCubeSize, connectorCubeSize
        );
        this.connectorPointerGeo = new THREE.BoxGeometry(
            connectorCubeSize/2, connectorCubeSize/2, connectorCubeSize/2
        );
        this.centerCubeGeo = new THREE.BoxGeometry(
            this.cubeSize, this.cubeSize, this.cubeSize
        );

        this.envbrowser = envbrowser;

        this.connectorLineMaterial = new THREE.LineBasicMaterial({color: 0x555555, linewidth: 20});

        this.particleMaterials = [];
        this.lineViewFactor = 2;
    }

    clone(): VisualPolycubeSystem {
        let copy = new VisualPolycubeSystem(
            false,
            this.nMaxCubes,
            this.maxCoord,
            this.confMap === undefined,
            this.torsion,
            this.envbrowser,
            this.maxPieceSize,
            this.rng_seed);
        this.set_rule(this.cube_types);
        this.forEachCube((v, k) =>
        {
            copy.cubes.set(k, v.clone(v.personalName));
        });
        this.moveKeys.forEach((v, i) => {
            copy.moveKeys[i] = v;
            copy.moves.set(vecToStr(v), this.getMove(v).clone());
        });
        copy.steps = this.steps;
        return copy;
    }

    reset(reset_random: boolean = true) {
        super.reset(reset_random);
        this.centerOfMass = new Vector3(0, 0, 0);
        this.envbrowser.empty();
        this.objGroup.children = [];

        this.lineGroup.visible = false;
        this.current_stage = 0;
        while(this.lineGroup.children.length > 0) {
            this.lineGroup.children.pop();
        }
        this.particleMaterials.forEach(m=>{
            m.transparent = false;
            m.opacity = 1;
        });
    }

    regenerate() {
        super.regenerate();
        if (typeof window !== 'undefined') {
            let argstr = this.cube_types.length > 0 ? "?decRule="+this.getRuleStr() : "";
            window.history.pushState(null, null, argstr);
        }
    }

    drawCube(cube: PolycubeCube) {
        this.objGroup.add(cube.draw(this.connectorCubeGeo,
            this.particleMaterials[cube.type_id].clone(),
            this.centerCubeGeo));
        this.envbrowser.append(cube.envvis);
        cube.envvis.mouseenter(function(e){
            let c = new THREE.Color($(e.currentTarget).css('border-color'));
            (cube.cube_vis.material as MeshLambertMaterial).color = c.offsetHSL(0, 25, 0);
            render();
        });
        cube.envvis.mouseleave(function(e){
            (cube.cube_vis.material as MeshLambertMaterial).color = new THREE.Color($(e.currentTarget).css('border-color'));
            render();
        });
    }

    addParticle(cube_instance) {
        this.drawCube(cube_instance);

        super.addParticle(cube_instance);
        this.centerOfMass.multiplyScalar(this.numCubes());
        this.centerOfMass.add(cube_instance.position);
        this.centerOfMass.divideScalar(this.numCubes());

        $("#mismatchcount").text(`${this.numMismatches()}`)

        render();
    }


    makeLine(a, b, color: number) {
        a.sub(a.clone().sub(b).setLength(this.cubeSize / 3));
        b.sub(b.clone().sub(a).setLength(this.cubeSize / 3));
        const points = [];
        points.push(a);
        points.push(b);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = this.connectorLineMaterial.clone();
        let mat_color: any = patchColor(color);
        material.color.set(mat_color);
        return new THREE.Line(geometry, material);
    }

    updateMoves(cube) {
        super.updateMoves(cube);
        // refresh the UI - patch activations
        let face_vis = this.envbrowser.children(`[name=${cube.personalName}]`).children(".face-label");
        let i = 0;
        cube.patches.forEach((p, idx)=>{
            if (p.color){
                cube.refresh_patch_active_visual(idx, $(face_vis[i]));
                i++;
            }
        })
    }


    set_rule(rules?, reset_random = true) {
        super.set_rule(rules, reset_random);
        this.particleMaterials = this.cube_types.map((ct, i) => {
            return new THREE.MeshLambertMaterial({
                color: cubeTypeColor(i),
                transparent: false,
                opacity: 1
            })
        });
        render();
    }

    addCubeType(cubeType, update_piecewise: boolean = true) {
        super.addCubeType(cubeType, update_piecewise);
        this.particleMaterials.push(new THREE.MeshLambertMaterial({
            color: cubeTypeColor(this.cube_types.length-1)
        }));
    }

    toggleLineView() {
        if (!this.lineGroup.visible) {
            //this.objGroup.visible = false;
            this.lineGroup.visible = true;
            if (this.lineGroup.children.length == 0) {
                this.connections.forEach(c=>{
                    this.lineGroup.add(this.makeLine(c.cube_1.position ,c.cube_2.position, c.color));
                });
            }
            this.objGroup.children.forEach(cube=>{
                cube.scale.multiplyScalar(1/this.lineViewFactor);
            });
            this.particleMaterials.forEach(m=>{
                m.transparent = true;
                m.opacity = 0.5;
            });
        } else {
            this.objGroup.visible = true;
            this.lineGroup.visible = false;
            this.objGroup.children.forEach(cube=>{
                cube.scale.multiplyScalar(this.lineViewFactor);
            });
            this.particleMaterials.forEach(m=>{
                m.transparent = false;
                m.opacity = 1;
            });
        }
        fitCamera();
    }

}


document.addEventListener("keydown", event => {
    if (event.key == 's' && event.ctrlKey) {
        event.preventDefault();
        downloadStructure();
    }
});

let rulesToImage;
rulesToImage = [];

// function toggleModal(id) {
//     let modal = document.getElementById(id);
//     modal.classList.toggle("show-modal");
// }

// Adapted from https://stackoverflow.com/a/41350703
function getSpiralCoord(n) {
    const k = Math.ceil((Math.sqrt(n) - 1) / 2);
    let t = 2 * k + 1;
    let m = Math.pow(t, 2);

    t -= 1;

    if (n >= m - t) {
        return new THREE.Vector3(0, k - (m - n), -k);
    }

    m -= t;

    if (n >= m - t) {
        return new THREE.Vector3(0, -k, -k + (m - n));
    }

    m -= t;

    if (n >= m - t) {
        return new THREE.Vector3(0, -k + (m - n), k);
    }

    return new THREE.Vector3(0, k, k - (m - n - t));
}


export function onWindowResize() {
    window.camera.aspect = window.innerWidth / window.innerHeight;
    window.camera.updateProjectionMatrix();
    window.renderer.setSize(window.innerWidth, window.innerHeight);
    render();
}

// Regenerate when there are no more cubes to add
window.addEventListener('movesProcessed', function(e) {
    fitCamera();
}, false);


export function toggleFog(density=0.08) {
    console.warn("Please don't")
    // if (!window.scene.fog || window.scene.fog.density != density) {
    //     window.scene.fog = new THREE.FogExp2(0xffffff, density);
    // } else {
    //     window.scene.fog = undefined;
    // }
    // render();
}

export function render() {
    window.renderer.render(window.scene, window.camera);
}

// From https://github.com/mrdoob/three.js/pull/14526#issuecomment-497254491
function fitCamera(nSteps?) {
    // @ts-ignore
    if (window.camera.type == "OrthographicCamera") {
        return
    }
    nSteps = nSteps || 20;
    const fitOffset = 1.3;
    // create THREE.Box3 object
    const box = new THREE.Box3();
    // expand box to include all scene objects
    box.expandByObject(window.system.objGroup);
    // get box size
    const size = box.getSize(new THREE.Vector3()).addScalar(1.5);
    // find center of mass of system
    const center = window.system.centerOfMass; //box.getCenter(new THREE.Vector3());
    // find max size
    const maxSize = Math.max(size.x, size.y, size.z);
    // wtf
    const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * window.camera.fov / 360));
    // help
    const fitWidthDistance = fitHeightDistance / window.camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);
    const direction = window.orbit.target.clone().sub(window.camera.position).normalize().multiplyScalar(distance);
    window.orbit.maxDistance = distance * 10;
    window.camera.near = distance / 100;
    window.camera.far = distance * 100;
    let targetPos = window.orbit.target.clone().sub(direction);

    let i = 1;
    let zoomOut = function() {
        window.camera.position.lerp(targetPos, Math.pow(i/nSteps,2));

        let curr = window.camera.quaternion.clone();
        window.camera.lookAt(window.system.centerOfMass);
        let target = window.camera.quaternion.clone();
        window.camera.quaternion.copy(curr);
        window.camera.quaternion.slerp(target, i/nSteps)

        render();
        if(i < nSteps) {
            i++;
            requestAnimationFrame(zoomOut.bind(this));
        } else {
            window.orbit.target.copy(center);
        }
    }
    zoomOut();

}

export function initScene() {
    const aspect = window.innerWidth / window.innerHeight;
    window.cameraPersp = new THREE.PerspectiveCamera(50, aspect, 0.01, 30000);
    window.cameraOrtho = new THREE.OrthographicCamera(-6 * aspect, 6 * aspect, 6, -6, 0.01, 30000);
    window.camera = window.cameraPersp;
    //camera = new THREE.PerspectiveCamera(
    //    45, window.innerWidth / window.innerHeight,
    //    1, 10000);
    window.camera.position.set(2, 4, 6);
    window.camera.lookAt(0, 0, 0);

    window.scene = new THREE.Scene();

    // lights
    let ambientLight = new THREE.AmbientLight(0x707070);
    // ambientLight.intensity = Math.PI;
    window.camera.add(ambientLight);

    let directionalLight = new THREE.PointLight(0x707070);
    // directionalLight.intensity = Math.PI;
    directionalLight.position.set(10, 10, 5).normalize();
    window.camera.add(directionalLight);

    window.scene.add(window.camera);

    window.canvas = document.getElementById("threeCanvas") as HTMLCanvasElement;
    window.renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: window.canvas,
        alpha: true,
        preserveDrawingBuffer: true
    });
    window.renderer.setPixelRatio(window.devicePixelRatio);
    window.renderer.setSize(window.innerWidth, window.innerHeight);
    window.renderer.setClearColor(0x000000, 0);

    window.addEventListener('resize', onWindowResize, false);

    // orbit controls

    window.orbit = new OrbitControls(window.camera, window.renderer.domElement);
    window.orbit.damping = 0.2;
    window.orbit.addEventListener('change', render);
    render();
}

declare global {
    export interface Window {

        cameraPersp: THREE.PerspectiveCamera, cameraOrtho: THREE.OrthographicCamera, camera: THREE.PerspectiveCamera;
        orbit, scene: Scene, renderer: WebGLRenderer;
        plane;
        raycaster: Raycaster;
        mouse: Vector2;
    }
}

initScene();

// window.orbit = new OrbitControls(window.camera, window.renderer.domElement);
// window.transform = new TransformControls(window.camera, window.renderer.domElement)

