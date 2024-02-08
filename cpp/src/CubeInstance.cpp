//
// Created by josh on 5/14/23.
//

#include "CubeInstance.h"

CubeInstance::CubeInstance(const CubeType &cubeType, int uid) :
        m_Type(cubeType),
        m_iUID(uid),
        m_Rotation(Eigen::Quaternionf::Identity()),
        m_Position(VECTOR::Zero()),
        m_State(cubeType.stateSize()) {
    m_State[0] = true;
}

CubeInstance::~CubeInstance() {

}

int CubeInstance::getID() const {
    return m_iUID;
}

const CubeType &CubeInstance::getType() const {
    return m_Type;
}

VECTOR CubeInstance::position() const {
    return m_Position;
}

void CubeInstance::translate(Eigen::Vector3i moveBy) {
    m_Position = moveBy;
}

Eigen::Quaternionf CubeInstance::rotation() const {
    return m_Rotation;
}

/**
 * applies rot to the cube instance's rotation (does not consider position)
 * @param rot
 */
void CubeInstance::rotate(Eigen::Quaternionf rot) {
    m_Rotation = rot * m_Rotation;
}

/**
 * rotates this CubeInstance from vector v1 to vector v2
 * from Eigen docs for Quaternion::FromTwoVectors :
 * "Returns a quaternion representing a rotation between the two arbitrary vectors a and b. In other words, the built
 * rotation represent a rotation sending the line of direction a to the line of direction b, both lines passing
 * through the origin."
 * @param v1 begin vector
 * @param v2 end vector
 */
void CubeInstance::rotate(Eigen::Vector3i v1, Eigen::Vector3i v2) {
    ASSERT(v1.cast<float>().norm() == 1, "Vector v1 " << v1 << " appears not to be a valid direction vector!");
    ASSERT(v2.cast<float>().norm() == 1, "Vector v2 " << v2 << " appears not to be a valid direction vector!");
    // method will become extremely irate if you pass it the same vector twice
    rotate(Eigen::Quaternionf::FromTwoVectors(v1.cast<float>(), v2.cast<float>()));

}

/**
 * rotates the cube instance in global (lattice) space
 * @param rot
 */
void CubeInstance::rotateGlobal(Eigen::Quaternionf rot) {
    translate(ROUND((rot * position().cast<float>() )));
    rotate(rot);
}

/**
 * given a direction in GLOBAL space, returns the patch that faces that direction, taking cube rotation
 * into account
 * @param direction
 * @return
 */
Patch CubeInstance::patch(VECTOR direction) const {
//    diridx(direction);
    // apply instance rotation in reverse to global direction to get cube type direction index
    DirIdx global_idx = diridx(direction);
    DirIdx idx = diridxf(rotation().inverse() * direction.cast<float>());
    ASSERT(veceq(rotation() * RULE_ORDER[idx].cast<float>(), direction.cast<float>()), "ROTATION BAD NO");
    Patch p = getType().patch(idx);
    Patch p_rot = p * rotation(); // get original patch, apply rotation
    ASSERT(p_rot.dir() == direction, "DIRECTION MISMATCH FUCKFUCKFUCK");
    return p_rot;
}

/**
 * Checks if this cube instance has a patch facing the provided direction, in global space
 * @param direction direction vector, in global space
 * @return true if a patch exists on this cube facing direction, false otherwise
 */
bool CubeInstance::hasPatch(VECTOR direction) const {
    ASSERT(direction.norm() == 1, "Invalid direction vector!")
    DirIdx idx = diridxf(rotation().inverse() * direction.cast<float>());
    return getType().hasPatch(idx);
}

std::vector<bool> CubeInstance::getState() const {
    return m_State;
}

void CubeInstance::setState(const std::vector<bool> &newState) {
    m_State = newState;
}

bool CubeInstance::getStateVar(int i) const {
    ASSERT(i > -getType().stateSize(), "Index out of bounds");
    ASSERT(i < getType().stateSize(), "Index out of bounds");
    if (i > 0) {
        return m_State[i];
    }
    else if (i < 0) {
        return m_State[-i];
    }
    else return true;
}

void CubeInstance::setStateVar(int i, bool bNewVal) {
     // don't allow setting of state variable 0, which is the Tautology Variable to false
    ASSERT(i > 0 || bNewVal, "Index out of bounds");
    ASSERT(i < getType().stateSize(), "Index out of bounds");
    m_State[i] = bNewVal;
}

std::vector<Face> CubeInstance::getActiveFaces() const {
    // TODO: speed up this algorithm!!!!
    // create list of faces
    std::vector<Face> activeFaces;
    // loop rule order
    for (VECTOR d : RULE_ORDER){
        // if cube has patch (working in global space)
        if (hasPatch(d)){
            // grab patch
            Patch p = patch(d);
            // check if patch is active
            if (getStateVar(p.activationVar())){
                // push back list of active faces
                activeFaces.push_back(p);
            }
        }
    }
    return activeFaces;
}

/**
 * adds an edge, diregarding any possible problematic externalities
 * @param e
 */
void CubeInstance::addEdge(Connection e) {
    // one component of the edge should be this's ID
    assert(e.first == getID() || e.second == getID());
    m_Connections.emplace(e);
}

bool CubeInstance::hasEdge(Connection e) {
    return m_Connections.find(e) != m_Connections.end();
}

void CubeInstance::removeEdge(Connection e) {
    m_Connections.erase(e);
}

/**
 * a set of CubeIDs of cubes connected to this
 * @return
 */
std::set<int> CubeInstance::getConnectedCubes() const {
    std::set<int> neighbors;
    for (Connection e : m_Connections){
        neighbors.emplace(e.first == getID() ? e.second : e.first);
    }
    return neighbors;
}

std::vector<const SimulationMove *> CubeInstance::getEffectSimMoves() const {
    std::vector<const SimulationMove*> moves;
    for (std::shared_ptr<Effect> e : getType().effects()){
        moves.push_back(new EffectSM(e, getID()));
    }
    return moves;
}

std::ostream &operator<<(std::ostream &ostr, const Connection &c) {
    return ostr << c.first << c.second;
}

void operator<<(nlohmann::json &j, const CubeInstance *c) {
    j[JSON_CUBE_TYPE_KEY] = c->getType().getID();
    j[JSON_CUBE_POSITION_KEY] = json_xyz(c->position());
    j[JSON_CUBE_ROTATION_KEY] = json_wxyz(c->rotation());
    j[JSON_CUBE_STATE_KEY] = c->getState();
}
