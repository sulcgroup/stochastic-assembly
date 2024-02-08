//
// Created by josh on 5/15/23.
//


#include <utility>
#include "SimulationMove.h"
#include "PolycubesSimulation.h"

const std::string FormConnectionPcPcSM::NAME = "form_connection_polycube_polycube";
const std::string FormConnectionPcCSM::NAME = "form_connection_polycube_cube";
const std::string FormInternalConnectionSM::NAME = "form_internal_connection";
const std::string BreakInternalConnectionSM::NAME = "break_internal_connection";
const std::string EffectSM::NAME = "fire_effect";

FormConnectionSM::FormConnectionSM(int idx1, Move move1, int idx2, Move move2) :
        a_id{idx1},
        a_move{move1},
        b_id{idx2},
        b_move{move2} {

}

bool FormConnectionSM::isValid(const PolycubesSimulation &sim) const {
    return SimulationMove::isValid(sim);
}

nlohmann::json FormConnectionSM::toJSON() const {
    return SimulationMove::toJSON();
}

// --------- Move to form a connection between 2 Polycubes ----------- //
FormConnectionPcPcSM::FormConnectionPcPcSM(const Polycube *a,
                                           const Polycube *b,
                                           const Move &a_move,
                                           const Move &b_move,
                                           const Eigen::Affine3f b_transform) :
        FormConnectionSM(a->getID(), a_move, b->getID(), b_move),
        t{b_transform} {
    // do some checks
    ASSERT(veceq(
            a_move.pos().cast<float>(),
            b_transform * b_move.pos().cast<float>() + (b_transform * b_move.dir().cast<float>())
            ), "Transform incorrect!");
    ASSERT(veceq(
            (a_move.pos() + a_move.dir()).cast<float>(),
            b_transform * b_move.pos().cast<float>()
            ), "Transform incorrect!");
}

Polycube * FormConnectionPcPcSM::get_a(const PolycubesSimulation &sim) const {
    return sim.getPolycubeByID(a_id);
}

Polycube * FormConnectionPcPcSM::get_b(const PolycubesSimulation &sim) const {
    return sim.getPolycubeByID(b_id);
}

bool FormConnectionPcPcSM::isValid(const PolycubesSimulation &sim) const {
    if (!sim.hasPolycube(a_id) || !sim.hasPolycube(b_id)){
        return false;
    }
    // if either move doesn't exist, simulation move is not valid
    if (!get_a(sim)->moveExists(a_move)){
        return false;
    }
    if (!get_b(sim)->moveExists(b_move)){
        return false;
    }
    // if the two polycubes overlap, return false
    std::unique_ptr<Polycube, PolycubeDeleter> c(sim.getPolycubeByID(b_id)->clone(t));
    if (sim.getPolycubeByID(a_id)->overlaps(c.get())){
        return false;
    }
    // I think that's all of them?
    return true;
}

/**
 * executes a move which forms a connection between two polycubes
 * @param sim
 */
void FormConnectionPcPcSM::execute(PolycubesSimulation &sim) const {
    // form a connection between two polycubes
    Polycube* a = sim.getPolycubeByID(a_id); // NOT CONST because we're about to add b to this
    Polycube* b = sim.getPolycubeByID(b_id); // NOT CONST, because we're about to transform and pop this one
    // grab edge
    Connection e{a->getCube(a_move.pos())->getID(), b->getCube(b_move.pos())->getID()};
    b->transform(t);
    ASSERT(!a->overlaps(b), "OVERLAP");
    a->combine(b, {e});
}

float FormConnectionPcPcSM::probability(const PolycubesSimulation &sim) const {
    // TODO: different value?
    return sim.getDensity();
}

nlohmann::json FormConnectionPcPcSM::toJSON() const {
    nlohmann::json j;
    j[JSON_SM_TYPE_KEY] = FormConnectionPcPcSM::NAME;
    j[JSON_SM_TARGET_ID_KEY + "_a"] = a_id;
    j[JSON_SM_TARGET_ID_KEY + "_b"] = b_id;
    j[JSON_SM_POLYCUBE_MOVE_KEY + "_a"] = a_move.toJSON();
    j[JSON_SM_POLYCUBE_MOVE_KEY + "_b"] = b_move.toJSON();
    j[JSON_SM_POLYCUBE_TRANSFORM_KEY] = std::vector<float>(t.matrix().data(), t.matrix().data() + t.matrix().size());

    return j;
}

std::string FormConnectionPcPcSM::to_string() const {
    return "Formed connection between polycube ID " + std::to_string(a_id) + " and "
           + std::to_string(b_id) + " at moves {" + a_move.to_string() + "} and {" + b_move.to_string() + "}";
}

// ---------- move to form a connection between a cube and a polycube ---------- //

/**
 *
 * @param sim
 * @param pc
 * @param pc_move
 * @param cidx the index of a cube type to add
 * @param cube_move the index of a patch where to add
 */
FormConnectionPcCSM::FormConnectionPcCSM(const Polycube *pc,
                                         const Move &pc_move,
                                         int cidx,
                                         const Move &cube_move) :
        FormConnectionSM(pc->getID(), pc_move, cidx, cube_move)
        {

}

const Move &FormConnectionPcCSM::polycubeMove() const {
    return a_move;
}

const Move &FormConnectionPcCSM::cubeMove() const {
    return b_move;
}

bool FormConnectionPcCSM::isValid(const PolycubesSimulation &sim) const {
    // check if polycube exists
    if (!sim.hasPolycube(a_id)){
        return false;
    }

    // if move a doesn't exist
    if (!polycube(sim)->moveExists(a_move)){
        return false;
    }

    // if cube type is depleted
    if (sim.getCTLvl(b_id) == 0){
        return false;
    }
    // we can safely assume (famous last words) that the cube still becaues it's not instantiated

    // if the spot where the cube would go already contains a cube
    if (polycube(sim)->hasCube(a_move.pos() + a_move.dir())){
        return false;
    }

    // I think that's all of them?
    return true;
}

void FormConnectionPcCSM::execute(PolycubesSimulation &sim) const {
    // construct new cube instance
    CubeInstance* instance = sim.instantiateCube(getCubeTypeIdx());
    // even for assertions this one's word salad
    ASSERT(polycube(sim)->getCube(polycubeMove().pos())->hasPatch(polycubeMove().dir()),
           "Cube in polycube has no patch coreresponding to polycube move!");
    alignCube(instance, polycubeMove(), cubeMove());

    // construct connection object
    Connection c = {polycube(sim)->getCube(polycubeMove().pos())->getID(), instance->getID()};
    // do checks

#ifndef NDEBUG
    // cube on this polycube that will be interaction site
    CubeInstance* b = polycube(sim)->getCube(polycubeMove().pos());

    // check if cubes are adjacent
    ASSERT((instance->position().cast<float>() - b->position().cast<float>()).norm() == 1, "Cubes are not adjacent!!!");
    // check if the new cube instance has a patch facing the polycube
    VECTOR cubeRotatedMoveDir = polycubeMove().pos() - instance->position();
    ASSERT(instance->hasPatch(cubeRotatedMoveDir), "Invalid patch on a!");
    // check if the polycube has a patch facing the new cube
    VECTOR bdir = instance->position() - polycubeMove().pos();
    ASSERT(b->hasPatch(bdir), "Invalid patch on b!");
    // check if the patches will interact properly
    ASSERT(sim.interaction(
            instance->patch(cubeRotatedMoveDir),
            b->patch(bdir)),
           "Incompatible patch colors!");
    // check if torsion correct if applicable
    VECTOR b_patch_ori = b->patch(bdir).ori();
    ASSERT(!sim.hasTorsion() || (polycubeMove().ori() == instance->patch(cubeRotatedMoveDir).ori()),
           "Incompatible patch orientations!");
#endif

    // add cube and connection
    polycube(sim)->addCube(instance, c);
}

float FormConnectionPcCSM::probability(const PolycubesSimulation &sim) const {
    // TODO: different value?
    return sim.getDensity();
}

nlohmann::json FormConnectionPcCSM::toJSON() const {
    nlohmann::json j;
    // Convert member variables to JSON
    j[JSON_SM_TYPE_KEY] = FormConnectionPcCSM::NAME;

    j[JSON_SM_TARGET_ID_KEY] = a_id;
    j[JSON_SM_POLYCUBE_MOVE_KEY] = a_move.toJSON();
    j[JSON_SM_CUBE_ID_KEY] = b_id;
    j[JSON_SM_CUBE_MOVE_KEY] = b_move.toJSON();
    return j;
}

/**
 *
 * @param sim
 * @return the number of distinct ways that this simulation move can occur
 */
int FormConnectionPcCSM::multiplicity(const PolycubesSimulation &sim) const {
    return sim.getCTLvl(b_id);
}

Polycube * FormConnectionPcCSM::polycube(const PolycubesSimulation &sim) const {
    return sim.getPolycubeByID(a_id);
}

std::string FormConnectionPcCSM::to_string() const {
    return "Move adding cube with type ID " + std::to_string(b_id) + " to polycube with ID " + std::to_string(a_id)
           + " at polycube move " + a_move.to_string();
}

// ------------- shared internal connection simulation move methods ---------- //
InternalConnectionSM::InternalConnectionSM(int polycube, int c1idx, int c2idx) :
    cube_a_idx{c1idx},
    cube_b_idx{c2idx},
    target{polycube}
{

}

nlohmann::json InternalConnectionSM::toJSON() const {
    nlohmann::json j;
    j[JSON_SM_TARGET_ID_KEY] = target;
    j[JSON_SM_CUBE_ID_KEY + "_a"] = cube_a_idx;
    j[JSON_SM_CUBE_ID_KEY + "_b"] = cube_b_idx;
    return j;
}

Polycube * InternalConnectionSM::getTarget(const PolycubesSimulation &sim) const {
    return sim.getPolycubeByID(target);
}

const CubeInstance *InternalConnectionSM::cube_a(const PolycubesSimulation &sim) const {
    return getTarget(sim)->getCubeByID(cube_a_idx);
}

const CubeInstance *InternalConnectionSM::cube_b(const PolycubesSimulation &sim) const {
    return getTarget(sim)->getCubeByID(cube_b_idx);
}

Patch InternalConnectionSM::patch_a(const PolycubesSimulation &sim) const {
    return cube_a(sim)->patch(cube_b(sim)->position() - cube_a(sim)->position());
}

Patch InternalConnectionSM::patch_b(const PolycubesSimulation &sim) const {
    return cube_b(sim)->patch(cube_a(sim)->position() - cube_b(sim)->position());
}

// -------- move to form a connection between two cubes --------- //
bool FormConnectionCCSM::isValid(const PolycubesSimulation &sim) const {
    // all patch activation issues should have been handled when this move generated, and
    // there are no potential steric issues
    if (a_id != b_id){
        return sim.getCTLvl(a_id) > 0 && sim.getCTLvl(b_id) > 0;
    }
    else
        return sim.getCTLvl(a_id) > 1;
}

/**
 * Executes a move that forms a connection between two cubes
 * @param sim a pointer to the PolycubeSimulation object in which this move is being carried out
 */
void FormConnectionCCSM::execute(PolycubesSimulation &sim) const {
    // instantiate first cube
    CubeInstance* a = sim.instantiateCube(a_id);
    // do not rotate cube a - we'll use its rotation as the basis for the rest of the polycube

    // instantiate second cube
    CubeInstance* b = sim.instantiateCube(b_id);
    // rotate cube b so that move_a and move_b have opposite directions

    alignCube(b, a_move, b_move);

#ifndef NDEBUG
    ASSERT((a->position().cast<float>() - b->position().cast<float>()).norm() == 1, "Cubes are not adjacent!!!");
    VECTOR adir = b->position() - a->position();
    ASSERT(a->hasPatch(adir), "Invalid patch on a!");
    VECTOR bdir = a->position() - b->position();
    ASSERT(b->hasPatch(bdir), "Invalid patch on b!");
    ASSERT(sim.interaction(
            a->patch(adir),
            b->patch(bdir)),
           "Incompatible patch colors!");
    VECTOR a_patch_ori = a->patch(adir).ori();
    VECTOR b_patch_ori = b->patch(bdir).ori();
    ASSERT(!sim.hasTorsion() || (a_patch_ori == b_patch_ori),
           "Incompatible patch orientations!");
#endif

    // add a new polycube with these cubes and an edge connecting them
    sim.addPolycube({a, b}, {{a->getID(), b->getID()}});
}

nlohmann::json FormConnectionCCSM::toJSON() const {
    nlohmann::json j;
    j[JSON_SM_CUBE_ID_KEY + "_a"] = a_id;
    j[JSON_SM_CUBE_ID_KEY + "_b"] = b_id;
    j[JSON_SM_CUBE_MOVE_KEY + "_a"] = a_move.toJSON();
    j[JSON_SM_CUBE_MOVE_KEY + "_b"] = b_move.toJSON();
    return j;
}

float FormConnectionCCSM::probability(const PolycubesSimulation &sim) const {
    // TODO: different value?
    return sim.getDensity();
}

/**
 * @param sim
 * @return the number of ways that this interaction can happen
 */
int FormConnectionCCSM::multiplicity(const PolycubesSimulation &sim) const {
    // TODO: consider case a_idx == b_idx
    return sim.getCTLvl(a_id) * sim.getCTLvl(b_id);
}

std::string FormConnectionCCSM::to_string() const {
    return "Join cube of type " + std::to_string(a_id) + " and type " + std::to_string(b_id)
           + " with connection color " + std::to_string(abs(a_move.color()));
}

bool FormInternalConnectionSM::isValid(const PolycubesSimulation &sim) const {
    // TODO: check if memory for Polycube has been deallocated!!! unlikely but possible!!!
    // check if both cubes are still present
    if (!getTarget(sim)->hasCube(cube_a_idx)){
        return false;
    }
    if (!getTarget(sim)->hasCube(cube_b_idx)){
        return false;
    }
    // check if applicable patches are active
    CubeInstance* c1 = getTarget(sim)->getCubeByID(cube_a_idx);
    CubeInstance* c2 = getTarget(sim)->getCubeByID(cube_b_idx);
    if (!c1->getStateVar(c1->patch(c1->position() - c2->position()).activationVar())){
        return false;
    }
    if (!c2->getStateVar(c2->patch(c2->position() - c1->position()).activationVar())){
        return false;
    }
    return true;
}

/**
 *
 */
void FormInternalConnectionSM::execute(PolycubesSimulation &sim) const {
    // TODO: anything else to do here?
    getTarget(sim)->addConnection(Connection(cube_a_idx, cube_b_idx));
}

float FormInternalConnectionSM::probability(const PolycubesSimulation &sim) const {
    // TODO: real number
    return 1;
}

nlohmann::json FormInternalConnectionSM::toJSON() const {
    nlohmann::json j = InternalConnectionSM::toJSON();
    j[JSON_SM_TYPE_KEY] = NAME;
    return j;
}

std::string FormInternalConnectionSM::to_string() const {
    return "Formed internal connection in polycube with ID " + std::to_string(target)
           + " between cube with ID " + std::to_string(cube_a_idx) + " and ID " + std::to_string(cube_b_idx);
}

// --------------------- move to break a connection between two cubes -------------- //
bool BreakInternalConnectionSM::isValid(const PolycubesSimulation &sim) const {
    // this will nearly always be true
    return getTarget(sim)->hasConnection({cube_a_idx, cube_b_idx});
}

void BreakInternalConnectionSM::execute(PolycubesSimulation &sim) const {
    CubeInstance* cube1 = getTarget(sim)->getCubeByID(cube_a_idx);
    CubeInstance* cube2 = getTarget(sim)->getCubeByID(cube_b_idx);
    getTarget(sim)->breakConnection(Connection(cube1->getID(), cube2->getID()));
}

/**
 * @return probability of a connection between patch1 and patch2 breaking on polycube
 */
float BreakInternalConnectionSM::probability(const PolycubesSimulation &sim) const {
    // boltzmann probability e^(-delta-E / T)
    // delta-E for bond breaking should be +bond energy
    // which is stored in the interaction matrix
    if (sim.getTemperature() > 0) {
        return exp(-sim.interaction(patch_a(sim).color(), patch_b(sim).color()) / sim.getTemperature());
    }
    // if T=0, E/t -> inf, so e^(-E/T) -> 0
    // so boltzmann probability of an energetically favorable bond breaking will be 0
    else {
        return 0;
    }
}

nlohmann::json BreakInternalConnectionSM::toJSON() const {
    nlohmann::json j = InternalConnectionSM::toJSON();
    j[JSON_SM_TYPE_KEY] = NAME;
    return j;
}

std::string BreakInternalConnectionSM::to_string() const {
    return "Broke internal connection in polycube with ID " + std::to_string(target)
            + " between cube with ID " + std::to_string(cube_a_idx) + " and ID " + std::to_string(cube_b_idx);
}

// ------------ move to execute a dynamic effect ---------------- //
EffectSM::EffectSM(std::shared_ptr<Effect> e, int cubeID) :
        e{e},
        cubeID{cubeID} {

}

bool EffectSM::isValid(const PolycubesSimulation &sim) const {
    // if the cube that this SimulationMove targets has been deallocated
    if (!sim.cubeExists(cubeID)){
        return false;
    }
    return e->canFire(*sim.getCubeByID(cubeID));
}

void EffectSM::execute(PolycubesSimulation &sim) const {
    e->fire(*sim.getCubeByID(cubeID));
}

nlohmann::json EffectSM::toJSON() const {
    nlohmann::json j;
    j[JSON_SM_TYPE_KEY] = EffectSM::NAME;
    j[JSON_SM_CUBE_ID_KEY] = cubeID;
    j[JSON_EFFECT_KEY] = e->toJSON();
    return j;
}

float EffectSM::probability(const PolycubesSimulation &sim) const {
    // TODO: stochastic effect firings
    return 1;
}

std::string EffectSM::to_string() const {
    return "Effect fired on cube ID " + std::to_string(cubeID) + ", setting state var " + std::to_string(e->target());
}

/***
 * Aligns a cube instance so that cube move b lines up with an existing move a
 * @param b
 * @param a_move
 * @param b_move
 */
void alignCube(CubeInstance *b, const Move &a_move, const Move &b_move) {
    b->rotate(b_move.dir(), -a_move.dir());
    // adjust move_a so we can check its rotation
    Move b_move_rotated = b_move * b->rotation();
    ASSERT(b->hasPatch(b_move_rotated.dir()), "oops rotation bad!");
    ASSERT(b_move_rotated.dir() == -a_move.dir(), "OOPS ROTATION BAD");
    // rotate cube b so that move_a and our adjusted move_b have the same orientation
    // do this regardless of whether the simulation uses torsion! it's important for these things to be deterministic
    // randomizing rotations in non-torsional models has been handled elsewhere
    b->rotate(b_move_rotated.ori(), a_move.ori());
    // move b so that it is adjacent to a and connected by move_a, move_b_rotated
    b->translate(a_move.pos() + a_move.dir());
}
