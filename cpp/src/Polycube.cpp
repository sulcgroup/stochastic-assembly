//
// Created by josh on 5/12/23.
//

#include <list>
#include <unordered_set>
#include "Polycube.h"

Polycube::Polycube(int id) : m_PolycubeID{id} {

}

/**
 * initial constructor. creates a Polycube object with two CubeInstances bound to each other
 * @param c1
 * @param c2
 */
Polycube::Polycube(int id, std::vector<CubeInstance *> cubes, std::set<Connection> edges) :
        Polycube(id)
{
    m_Cubes = cubes;
    for (CubeInstance* c : cubes){
        m_CubePositionMap[c->position()] = c;
        m_CubeIDMap[c->getID()] = c;
    }
    m_PolycubeGraph = edges;
}

int Polycube::getID() const {
    return m_PolycubeID;
}

/**
 *
 * @return a vector of Moves
 */
std::vector<Move> Polycube::getMoves() const {
    // TODO: cache these
    std::vector<Move> moves;
    // loop cubes
    for (CubeInstance* c : m_Cubes){
        VECTOR position = c->position();
        // loop active faces
        for (Face f : c->getActiveFaces()){
            // if no cube is adjacent to face f of cube c
            if (!hasCube(f.dir() + position)){
                // add move
                moves.push_back({f, position});
            }
        }
    }
    return moves;
}

void Polycube::addCube(CubeInstance *instance) {

    ASSERT(instance, "Cannot add null cube instance!");
    ASSERT(!hasCube(instance->getID()), "Cube with ID " << instance->getID() << " is already in this polycube!");
    ASSERT(!hasCube(instance->position()), "Position " << instance->position() << " already occupied!");
    // add instance to cubes list
    m_Cubes.push_back(instance);
    // add instance to position map
    m_CubePositionMap[instance->position()] = instance;
    m_CubeIDMap[instance->getID()] = instance;
}

int Polycube::getNumCubes() const {
    return m_Cubes.size();
}

CubeInstance *Polycube::getCube(VECTOR v) const {
    ASSERT(hasCube(v), "No cube at " << v << "!");
    return m_CubePositionMap.at(v);
}

/**
 * returns a cube instance in this polycube by uid
 * @param id
 * @return
 */
CubeInstance *Polycube::getCubeByID(int id) const{
    ASSERT(m_CubeIDMap.contains(id), "Cube with ID " << id << " not in polycube!");
    return m_CubeIDMap.at(id);
}

CubeInstance *Polycube::getCubeByIdx(int idx) const {
    ASSERT(idx > -1, "Index out of bounds");
    ASSERT(idx < getNumCubes(), "Index out of bounds");
    return m_Cubes.at(idx);
}

const std::vector<CubeInstance *> &Polycube::getCubes() const {
    return m_Cubes;
}

/**
 * adds a cube instance to this polycube, connected to the rest of the polycube with the
 * provided connection object
 * @param inst
 * @param c
 */
void Polycube::addCube(CubeInstance *inst, Connection c) {
    ASSERT(inst, "Cannot add null cube instance!");
    ASSERT(!hasCube(inst->getID()), "Cube with ID " << inst->getID() << " is already in this polycube!");
    ASSERT(!hasCube(inst->position()), "Position " << inst->position() << " already occupied!");
    ASSERT(c.first == inst->getID() || c.second == inst->getID(), "Neither cube involved in the provided connection"
            << c << " has ID of instance to be added " << inst->getID());
    addCube(inst);
    addConnection(c);
}

/**
 * @param position
 * @return true if this Polycube has a cube at Position, false otherwise
 */
bool Polycube::hasCube(VECTOR position) const {
    return m_CubePositionMap.find(VectorKey(position)) != m_CubePositionMap.end();
}

bool Polycube::hasCube(int id) const {
    return m_CubeIDMap.find(id) != m_CubeIDMap.end();
}

bool Polycube::moveExists(const Move &move) const {
    // TODO: optimize
    // if no cube exists in the correct position, return false
    if (!hasCube(move.pos())){
        return false;
    }
    // if a cube exists in the position this move would occupy, return false
    if (hasCube(move.pos() + move.dir())){
        return false;
    }
    Patch p = getCube(move.pos())->patch(move.dir());

    // if patch has wrong color, return false
    if (p.color() != move.color()){
        return false;
    }
    // if patch is not active, return false
    if (!getCube(move.pos())->getStateVar(p.activationVar())){
        return false;
    }
    return true;
}

/**
 * joins two polycubes. adds edges from provided variable (should usually/always be length 1 but I'm futureproofing)
 * to connect the two. This method is NOT reflexive! a.combine(b) != b.combine(a)
 * @param b
 * @param edges
 */
void Polycube::combine(const Polycube *b, std::set<Connection> edges) {
    // add all cubes from a to b
    for (CubeInstance* cube : b->getCubes()){
        addCube(cube);
    }
    // add all connections/edges/whatever we're calling them from a to b
    for (Connection e : b->getConnections()){
        addConnection(e);
    }
    // add all edges from provided arg
    for (Connection e : edges){
        addConnection(e);
    }
    // done?
}

/**
 * @param other
 * @return true if any position is occupied by a cube both in this and other, false otherwise
 */
bool Polycube::overlaps(const Polycube *other) const {
    // TODO: optimize?

    // WARNING: this code was written by ChatGPT
    std::unordered_set<VectorKey> vectorSet;

    // Insert all VECTOR objects from vector1 into the hash set
    for (const auto& cube : getCubes()) {
        VectorKey key(cube->position());
        vectorSet.insert(key);
    }

    // Check if any VECTOR object from vector2 is present in the hash set
    for (const auto& cube : other->getCubes()) {
        VectorKey key(cube->position());
        if (vectorSet.find(key) != vectorSet.end()) {
            return true;  // Found a matching VECTOR object
        }
    }
    return false;
}

/**
 * Constructs a deep copy of the Polycube* passed as an arguement and transforms it by the provided transformation
 * WARNING: THIS METHOD WILL CREATE DUPLICATE CUBE INSTANCES!!!
 * @param original
 * @param transform
 */
std::unique_ptr<Polycube, PolycubeDeleter> Polycube::clone(Eigen::Affine3f transform) const{
    std::unique_ptr<Polycube, PolycubeDeleter> pclone(new Polycube(getID()));
    // loop cubes in original
    for (CubeInstance* c : getCubes()){
        // create copy of cube instance
        CubeInstance* cclone = new CubeInstance(c->getType(), c->getID());
        cclone->translate(c->position());
        cclone->rotate(c->rotation());
        cclone->setState(c->getState());
        pclone->m_Cubes.push_back(cclone);
        pclone->m_CubePositionMap[cclone->position()] = cclone;
        pclone->m_CubeIDMap[cclone->getID()] = cclone;
    }

    // clone graph
    pclone->m_PolycubeGraph = m_PolycubeGraph;

    pclone->transform(transform);
    return pclone;
}


void Polycube::transform(const Eigen::Affine3f t) {
    // reset position map
    m_CubePositionMap.clear();

    // loop cubes
    for (CubeInstance* c : m_Cubes){
        // rotate cube in-place
        c->rotate(Eigen::Quaternionf(t.rotation()));
        // apply transform
        c->translate(ROUND((t * c->position().cast<float>() )));
        // emplace in position map
        m_CubePositionMap[c->position()] = c;
    }
    // I think. this is all?
}


// ------------------ GRAPH THEORY FUNCTIONS ----------------------------------------//
/**
 * adds an edge between two CubeInstance objects
 * updates internal variables
 * @param e
 */
void Polycube::addConnection(Connection e) {
    ASSERT(hasCube(e.first), "No cube with ID " << e.first << " in polycube");
    ASSERT(hasCube(e.second), "No cube with ID " << e.second << " in polycube");
    CubeInstance* a = getCubeByID(e.first);
    CubeInstance* b = getCubeByID(e.second);
    // relative position of two cubes
    VECTOR rel = b->position() - a->position();
    ASSERT(rel.norm() == 1, "Distance between cube positions " << a->position().transpose() << " and " << b->position().transpose() << " is not 1 unit!");
    ASSERT(!m_PolycubeGraph.contains(e), "Edge " << e.str() << " already in graph!");
    Patch a_patch = a->patch(rel);
    Patch b_patch = b->patch(-rel);
    // TODO: remove this next assert once I feel safe that it works. conflicts with interaction matrix stuff
    ASSERT(a_patch.color() == -b_patch.color(), "Patches don't have matching colors!");
    // add edge to graph
    m_PolycubeGraph.emplace(e);
    // add edges to cube instance objects
    a->addEdge(e);
    b->addEdge(e);
    // update state varibles
    a->setStateVar(a_patch.stateVar());
    b->setStateVar(b_patch.stateVar());
}

/**
 * breaks a connection between two cubes
 * does NOT handle externalities (eg seperating the two)
 * @param e
 */
void Polycube::breakConnection(Connection e) {
    ASSERT(hasCube(e.first), "No cube with ID " << e.first << " in polycube");
    ASSERT(hasCube(e.second), "No cube with ID " << e.second << " in polycube");
    CubeInstance* a = getCubeByID(e.first);
    CubeInstance* b = getCubeByID(e.second);
    ASSERT(m_PolycubeGraph.contains(e), "Edege " << e.str() << "not in graph!");
    m_PolycubeGraph.erase(e);
    a->removeEdge(e);
    b->removeEdge(e);
}

bool Polycube::hasConnection(Connection e) const {
    return m_PolycubeGraph.count(e) == 1;
}

const std::set<Connection> &Polycube::getConnections() const {
    return m_PolycubeGraph;
}

/**
 * TODO: cache results?
 * @return true if the graph is connected, false otherwise
 */
bool Polycube::isConnected() const {
    // find the set of all cubes connected with an arbitrarily chosen origin cube
    // if that set is not the same size as the polycube, then the polycube is not connected
    return getConnectedCubes(m_Cubes[0]->getID()).size() == getNumCubes();
}

/**
 *
 * @param startID the ID of the cube instance that we will start with
 * @return
 */
std::set<int> Polycube::getConnectedCubes(int startID) const {
    // breadth-first search or depth-first search?
    // going with breadth-first for now
    // code kind of from https://www.geeksforgeeks.org/breadth-first-search-or-bfs-for-a-graph/
    // uses a set<int> rather than an indexed vector<bool> b/c we don't know the max val for c->getID() locally.
    std::set<int> visited;

    // Create a queue for BFS
    std::list<int> queue;

    // Mark the current node as visited and enqueue it
    visited.emplace(startID);
    queue.push_back(startID);

    int id;
    while (!queue.empty()) {

        // Dequeue a vertex from queue and print it
        id = queue.front();
        queue.pop_front();

        // Get all adjacent vertices of the dequeued
        // vertex s. If a adjacent has not been visited,
        // then mark it visited and enqueue it
        for (auto adjacent : getCubeByID(id)->getConnectedCubes()) {
            if (visited.find(adjacent) == visited.end()) {
                visited.emplace(adjacent);
                queue.push_back(adjacent);
            }
        }
    }
    return visited;
}

/**
 * warning! allocates memory which will need to be manually deallocated!!
 * @return
 */
std::vector<const SimulationMove *> Polycube::getBreakInternalConnectionMoves() const {
    std::vector<const SimulationMove *> moves;
    for (Connection c : getConnections()){
        moves.push_back(new BreakInternalConnectionSM(getID(), c.first, c.second));
    }
    return moves;
}

void operator<<(nlohmann::json& j, const Polycube* polycube) {
    std::stringstream out;

    j = nlohmann::json::array();

    for (int i = 0; i < polycube->getNumCubes(); i++) {
        j.emplace_back();
        j << polycube->getCubeByIdx(i);
    }

}

// Definition of PolycubeDeleter::operator()
void PolycubeDeleter::operator()(Polycube* polycube) const {
    for (CubeInstance* cube : polycube->m_Cubes) {
        delete cube;
    }
    delete polycube;
}