//
// Created by josh on 5/12/23.
//

#include <fstream>
#include <nlohmann/json.hpp>

#include "PolycubesSimulation.h"
#include "SimulationMove.h"

SimulationParameters simParamsFromJSONFile(std::string filepath){
    // open file stream
    std::ifstream fin(filepath);
    // construct json object
    nlohmann::json j;
    // load file data into json object
    fin >> j;
    // close file stream
    fin.close();

    // cube type array
    std::vector<CubeType> cube_types;

    // if the rule is formatted as a rule string
    if (j[RULE_KEY].is_string()){
        cube_types = parseRule(j[RULE_KEY], 0);
    }
    // if the rule is formatted as a cube type JSON list
    else {
        cube_types = ruleFromJSON(j[RULE_KEY], 0);
    }

    // load or generate interaction matrix
    std::map<std::pair<int, int>, float> interaction_matrix;
    if (j[INTERACTION_MATRIX_KEY]){
        // figure this out when I eventually bother to take it seriously
    }
    else {
        // generate default interaction matrix
        // first determine max color
        int maxColor = 0;
        for (auto& ct : cube_types){
            for (int i = 0; i < DirIdx::NUM_DIR_IDXS; i++){
                if (ct.hasPatch(DirIdx(i))){
                    maxColor = std::max(maxColor, ct.patch(DirIdx(i)).color());
                }
            }
        }
        // all colors bind to their opposites and nothing else
        for (int i = 1; i < maxColor + 1; i++){
            interaction_matrix[{-i, i}] = 1.0;
        }
    }

    int numSteps = 1e3;
    if (j.contains(NUM_STEPS_KEY)){
        numSteps = j[NUM_STEPS_KEY];
    }

    unsigned randSeed = std::chrono::system_clock::now().time_since_epoch().count();
    if (j.contains(RAND_SEED_KEY)){
        numSteps = j[RAND_SEED_KEY];
    }

    return {
        j[TORSION_KEY],
        j[DEPLETES_TYPES_KEY],
        j[TEMPERATURE_KEY],
        j[DENSITY_KEY],
        cube_types,
        j[START_LEVELS_KEY],
        numSteps,
        interaction_matrix,
        randSeed
    };
}

/**
 * @param seedChange the amount by which to change the rng seed from the original. if -1 (default), the method
 * will seed the clone with current system time
 * @return a copy of this SimulationParameters object, but with the RNG reseeded
 */
SimulationParameters SimulationParameters::dupliacte(int seedChange) const {
    SimulationParameters clone = *this; // make copy
    if (seedChange > -1){
        clone.randSeed += seedChange;
    }
    else {
        clone.randSeed = std::chrono::system_clock::now().time_since_epoch().count(); // reset seed
    }
    return clone;
}

int SimulationParameters::max_color() const {
    int max_color = 0;
    for (int i = 0; i < cube_types.size(); i++){
        for (int j = 0; j < cube_types[i].patches().size(); j++){
            max_color = std::max(std::abs(cube_types[i].patches()[j].color()), max_color);
        }
    }
    return max_color;
}

nlohmann::json SimulationParameters::json() const {
    nlohmann::json j;
    // basic parameters
    j[TEMPERATURE_KEY] = temperature;
    j[DEPLETES_TYPES_KEY] = depletes_types;
    j[TORSION_KEY] = torsion;
    j[DENSITY_KEY] = density;
    j[NUM_STEPS_KEY] = numSteps;
    j[RAND_SEED_KEY] = randSeed;
    // interaction matrix
    j[INTERACTION_MATRIX_KEY] = nlohmann::json();
    // todo: write interaction matrix
    for (int i = -max_color(); i <= max_color(); i++){
        for (int k = -max_color(); k <= max_color(); k++){
            if (interactionMatrix.contains({i, k}) and interactionMatrix.at({i, k}) > 0) {
                std::string key = "(" + std::to_string(i) + "," + std::to_string(k) + ")";
                j[INTERACTION_MATRIX_KEY][key] = interactionMatrix.at({i, k});
            }
        }
    }

    // cube stuff
    j[START_LEVELS_KEY] = nlohmann::json::array();
    // cube types
    j[JSON_CUBE_TYPES_KEY] = nlohmann::json::array();
    // may be possible to actually just assign json to vector?
    for (int iCubeType = 0; iCubeType < this->cube_types.size(); iCubeType++){
        // emplace cube type_step
        nlohmann::json jct;
        jct << cube_types[iCubeType];
        j[JSON_CUBE_TYPES_KEY].push_back(jct);
        j[START_LEVELS_KEY].push_back(cube_type_start_lvls[iCubeType]);
    }
    return j;
}

int HistoricalRecord::numPolycubes() const {
    return polycubes.size();
}

int HistoricalRecord::numCubeInstances() const {
    int iCount = 0;
    for (const std::unique_ptr<Polycube, PolycubeDeleter>& polycube : polycubes){
        iCount += polycube->getNumCubes();
    }

    return iCount;
}


void operator<<(nlohmann::json& j, const HistoricalRecord &record) {
    j[JSON_SIM_HISTORY_STEP_NUMBER_KEY] = record.step;
    nlohmann::json pcs = nlohmann::json::array();
    for (int idx = 0; idx < record.numPolycubes(); idx++){
        const std::unique_ptr<Polycube, PolycubeDeleter>& polycube = record.polycubes[idx];
        nlohmann::json pcj;
        pcj[JSON_SIM_HISTORY_CUBES_KEY] = nlohmann::json::array();
        for (const CubeInstance* instance : polycube->getCubes()) {
            nlohmann::json jcube;
            jcube << instance;
            pcj[JSON_SIM_HISTORY_CUBES_KEY].push_back(jcube);
        }
        pcs.push_back(pcj);
    }
    j[JSON_SIM_HISTORY_POLYCUBES_KEY] = pcs;
}

PolycubesSimulation::PolycubesSimulation(SimulationParameters simParams) :
        m_SimParams(simParams),
//        m_bTorsion(simParams.torsion),
//        m_bDepleteCubeTypes(simParams.depletes_types),
//        m_fTemperature(simParams.temperature),
//        m_fDensity(simParams.density),
//        m_CubeTypes(simParams.cube_types),
//        m_CubeTypeStartLevels(simParams.cube_type_start_lvls),
        m_CubeTypeLevels(simParams.cube_type_start_lvls),
//        m_iMaxSteps(simParams.numSteps),
        rng{simParams.randSeed},
        m_iStepCount(0),
//        m_InteractionMatrix(simParams.interactionMatrix),
        m_iCubeIDCounter(0),
        m_iPolycubeIDCounter(0)
{
    ASSERT(numCubeTypes() > 0, "No cube types!");
    ASSERT(m_SimParams.interactionMatrix.size() > 0, "No specified interactions!");
}

PolycubesSimulation::~PolycubesSimulation() {

}


bool PolycubesSimulation::hasTorsion() const {
    return m_SimParams.torsion;
}

bool PolycubesSimulation::isDepletesTypes() const {
    return m_SimParams.depletes_types;
}

float PolycubesSimulation::getTemperature() const {
    return m_SimParams.temperature;
}

float PolycubesSimulation::getDensity() const {
    return m_SimParams.density;
}

int PolycubesSimulation::numCubeTypes() const {
    return m_SimParams.cube_types.size();
}

CubeType PolycubesSimulation::getCubeType(int idx) const {
    ASSERT(idx > -1, "Index out of bounds");
    ASSERT(idx < numCubeTypes(), "Index out of bounds");
    return m_SimParams.cube_types[idx];
}

int PolycubesSimulation::numCubes() const {
    return m_CubeList.size();
}

CubeInstance *PolycubesSimulation::getCubeByID(int id) const {
    ASSERT(cubeExists(id), "No cube with ID " << id << " in ID map.");
    return m_CubeIDMap.at(id);
}

/**
 * @param id a cube instance ID
 * @return true if a cube instance exists with the provided ID, false otherwise
 */
bool PolycubesSimulation::cubeExists(int id) const {
    return m_CubeIDMap.count(id) == 1;
}

int PolycubesSimulation::getCTStartLvl(int idx) const {
    ASSERT(idx > -1, "Index out of bounds");
    ASSERT(idx < numCubeTypes(), "Index out of bounds");
    return m_SimParams.cube_type_start_lvls[idx] ;
}

int PolycubesSimulation::getCTLvl(int idx) const {
    ASSERT(idx > -1, "Index out of bounds");
    ASSERT(idx < numCubeTypes(), "Index out of boundds!");
    return m_CubeTypeLevels[idx];
}

int PolycubesSimulation::getNumPolycubes() const {
    return m_Polycubes.size();
}

int PolycubesSimulation::getPolycubeMaxID() const {
    return m_iPolycubeIDCounter;
}

// should really be const but c++ doesn't like that
Polycube * PolycubesSimulation::getPolycubeByIdx(int idx) {
    ASSERT(idx > -1, "Index out of bounds");
    ASSERT(idx < getNumPolycubes(), "Index out of bounds");
    return m_Polycubes[idx].get();
}

Polycube * PolycubesSimulation::getPolycubeByID(int idx) const {
    Polycube* pc = m_PolycubeMap.at(idx);
    ASSERT(pc->getID() == idx, "Broken polycube indexing!");
    return pc;
}

bool PolycubesSimulation::hasPolycube(int id) const {
    return m_PolycubeMap.contains(id);
}

std::vector<std::pair<const Polycube *, const Polycube *>> PolycubesSimulation::polycubePairs() const {
    std::vector<std::pair<const Polycube*, const Polycube*>> result;
    result.reserve(m_Polycubes.size() * (m_Polycubes.size() - 1) / 2);

    // make sure the size isn't 0, otherwise we will end up in an infinite loop
    if (getNumPolycubes() > 0) {
        result.reserve(getNumPolycubes() * (getNumPolycubes() - 1) / 2);

        for (size_t i = 0; i < getNumPolycubes() - 1; ++i) {
            for (size_t j = i + 1; j < getNumPolycubes(); ++j) {
                result.emplace_back(m_Polycubes[i].get(), m_Polycubes[j].get());
            }
        }
    }
    return result;
}

void PolycubesSimulation::addPolycube(std::vector<CubeInstance *> cubes, std::set<Connection> edges) {
    m_Polycubes.push_back(std::unique_ptr<Polycube>(new Polycube(m_iPolycubeIDCounter++, cubes, edges))); // create new polycube with new ID
    Polycube* pc = getPolycubeByIdx(getNumPolycubes() - 1);
    m_PolycubeMap[pc->getID()] = pc;
}

int PolycubesSimulation::getMaxSimMovesPerStep() const {
    return 1; // TODO: allow this to be set in simulation params
}

int PolycubesSimulation::currentStep() const {
    return m_iStepCount;
}

int PolycubesSimulation::maxSteps() const {
    return m_SimParams.numSteps;
}

SimulationParameters PolycubesSimulation::params() const {
    return m_SimParams;
}

float PolycubesSimulation::interaction(int c1, int c2) const {
    std::pair<int,int> pair = c1 > c2 ? std::pair<int,int>(c2, c1) : std::pair<int,int>(c1, c2);
    if (!m_SimParams.interactionMatrix.contains(pair)){
        return 0;
    }
    else {
        return m_SimParams.interactionMatrix.at(pair);
    }
}

float PolycubesSimulation::interaction(const Patch &p1, const Patch &p2) const {
    return interaction(p1.color(), p2.color());
}

const HistoricalRecord &PolycubesSimulation::getRecord(int iStep) const {
    ASSERT(iStep > -1, "Index out of bounds");
    ASSERT(iStep < m_History.size(), "Index out of bounds");
    return m_History[iStep];
}

CubeInstance *PolycubesSimulation::instantiateCube(int cubeTypeIdx) {
    ASSERT(m_CubeTypeLevels[cubeTypeIdx] > 0, "No cubes of type " << cubeTypeIdx << " remaining!");
    // create new CubeInstance arguement (using std::vector::emplace_back) and add it to the list
    m_CubeList.push_back(std::unique_ptr<CubeInstance>(new CubeInstance(m_SimParams.cube_types[cubeTypeIdx], m_iCubeIDCounter++)));
    // emplace pointer in ID map
    m_CubeIDMap[m_iCubeIDCounter] = m_CubeList[numCubes() - 1].get();
    return m_CubeList[numCubes() - 1].get();
}

std::vector<const SimulationMove*> PolycubesSimulation::getPotentialSimulationMoves() const {
    spdlog::info("--------------------- Generating Simulation Moves for Step "
                 + std::to_string(m_iStepCount) + " -----------------------");
    // todo: write properly
    std::vector<const SimulationMove*> potentialSimMoves;
    // connections between two loose cubes
    // TODO: optimize
    int counter;// for logging
    counter = 0;

    // loop cube types
    extend(potentialSimMoves, getCubeCubeSimMoves());

    counter = 0; // reset counter
    int counterb = 0, counterc = 0; // for make/break internal connections
    for (const auto &pc : m_Polycubes){

        extend(potentialSimMoves, getAddCubeSimMoves(pc, counter));
        // internal connections formed
        std::vector<const SimulationMove*> intconsms = getFormInternalConnectionMoves(pc.get());
        extend(potentialSimMoves, intconsms);
        counterb += intconsms.size();

        // internal connections broken
        std::vector<const SimulationMove*> brconsms = pc->getBreakInternalConnectionMoves();
        extend(potentialSimMoves, brconsms);
        counterc += brconsms.size();
    }
    spdlog::info("Gen'd " + std::to_string(counter) + " cube/polycube connection moves");
    spdlog::info("Gen'd " + std::to_string(counterb) + " moves which form internal connections");
    spdlog::info("Gen'd " + std::to_string(counterc) + " moves which break internal connections");

    // polycube-polycube joins
    extend(potentialSimMoves, getJoinPolycubeSimMoves());

    // dynamic effects
    counter = 0; // reset counter
    for (const std::unique_ptr<CubeInstance>& c : m_CubeList){
        std::vector<const SimulationMove*> fxmoves = c->getEffectSimMoves();
        extend(potentialSimMoves, fxmoves);
        counter += fxmoves.size();
    }
    spdlog::info("Gen'd " + std::to_string(counter) + " effect firing simulation moves");

    spdlog::info("Generated total " + std::to_string(potentialSimMoves.size()) + " simulation moves");

    return potentialSimMoves;
}

/**
 * warning! allocates memory which will need to be deallcoated
 * @param pc
 * @return
 */
std::vector<const SimulationMove *> PolycubesSimulation::getFormInternalConnectionMoves(const Polycube *pc) const {
    ASSERT(pc, "Polycube cannot be null!");
    // todo: more efficient algorithm?
    std::vector<const SimulationMove *> moves;
    // loop all possible pairs of cubes in this polycube
    for (auto [a,b] : getAllPairs(pc->getCubes())){
        // if the two are 1 lattice unit apart
        if ((a->position().cast<float>() - b->position().cast<float>()).norm() == 1){
            // if a connection doesn't already exist between these two cubes
            if (!pc->hasConnection({a->getID(), b->getID()})){
                // if patches exist that could connect these two
                if (a->hasPatch(b->position() - a->position()) &&
                    b->hasPatch(a->position() - b->position())) {
                    // grab patch objects
                    Patch pa = a->patch(b->position() - a->position());
                    Patch pb = b->patch(a->position() - b->position());
                    // if patch colors can interact (THIS is why this method needs to be in PolycubesSimulation)
                    if (interaction(pa.color(), pb.color())){
                        // if both patches are active
                        if (a->getStateVar(pa.activationVar()) && b->getStateVar(pb.activationVar())){
                            moves.push_back(new FormInternalConnectionSM(pc->getID(), a->getID(), b->getID()));
                        }
                    }
                }
            }
        }
    }
    return moves;
}

std::vector<const SimulationMove *> PolycubesSimulation::getCubeCubeSimMoves() const {
    std::vector<const SimulationMove*> potentialSimMoves;
    int counter = 0;

    for (int i = 0; i < numCubeTypes(); i++){
        if (getCTLvl(i) > 0){ // don't waste times with depleted types
            // inner loop cube types, starting with same type (so we can allow self-interaction)
            for (int j = i; j < numCubeTypes(); j++){
                if (getCTLvl(j) > 0) { // don't waste times with depleted types
                    for (Move mi: getCubeType(i).getMoves()) {
                        for (Move mj: getCubeType(j).getMoves()) {
//                            spdlog::info("Testing interaction between move " + mi.to_string() + " and " + mj.to_string());
                            if (interaction(getCubeType(i).patch(mi.dirIdx()), getCubeType(j).patch(mj.dirIdx()))) {
                                if (hasTorsion()) {
                                    potentialSimMoves.push_back(new FormConnectionCCSM(i, mi, j, mj));
                                    counter++;
                                }
                                else{
                                    // add 4 times - multiplicity!
                                    for (float k = 0; k < 4; k++) {
                                        float theta = M_PI * 2 * (k / 4); // get angle in radians
                                        // construct an axis angle
                                        Eigen::AngleAxisf axis_angle(theta, mj.fdir());

                                        Move mj_rot = mj * Eigen::Quaternionf(axis_angle);
                                        potentialSimMoves.push_back(new FormConnectionCCSM(i, mi, j, mj_rot));
                                        counter++;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    spdlog::info("Gen'd " + std::to_string(counter) + " cube-cube connection Simulation Moves (not considering mulitplicity)");
    return potentialSimMoves;
}

std::vector<const SimulationMove *>
PolycubesSimulation::getAddCubeSimMoves(const std::unique_ptr<Polycube> &pc, int &counter) const {
    std::vector<const SimulationMove*> potentialSimMoves;
    // moves joining a loose cube and a polycube
    for (int ctidx = 0; ctidx < numCubeTypes(); ctidx++) {
        // if cube type is present
        if (getCTLvl(ctidx) > 0){
            for (Move cubeMove : getCubeType(ctidx).getMoves()){
                for (Move polycubeMove : pc.get()->getMoves()) {
                    if (interaction(cubeMove.color(), polycubeMove.color())) {
                        // consider: torsion
                        if (hasTorsion()) {
                            potentialSimMoves.push_back(new FormConnectionPcCSM(pc.get(),
                                                                                polycubeMove,
                                                                                ctidx,
                                                                                cubeMove));
                            counter++;
                        } else {
                            // add 4 times - multiplicity!
                            for (float j = 0; j < 4; j++) {
                                float theta = M_PI * 2 * (j / 4); // get angle in radians
                                // construct an axis angle
                                Eigen::AngleAxisf axis_angle(theta, cubeMove.fdir());

                                Move m1_rot = cubeMove * Eigen::Quaternionf(axis_angle);
                                potentialSimMoves.push_back(new FormConnectionPcCSM(pc.get(), polycubeMove, ctidx, m1_rot));
                                counter++;
                            }
                        }
                    }
                }
            }
        }
    }
    return potentialSimMoves;
}

std::vector<const SimulationMove *> PolycubesSimulation::getJoinPolycubeSimMoves() const {
    std::vector<const SimulationMove*> potentialSimMoves;
    // moves joining two polycubes
    int counter = 0; // reset logging counter
    for (auto [a, b] : polycubePairs()){
        for (auto m1 : a->getMoves()){
            for (auto m2 : b->getMoves()){
                if (interaction(m1.color(), m2.color())){
                    extend(potentialSimMoves, alignPolycubes(a, m1, b, m2));
                    counter++;
                }
            }
        }
    }
    spdlog::info("Gen'd " + std::to_string(counter) + " polycube-polycube connection Simulation Moves (not considering mulitplicity");
    return potentialSimMoves;
}

/**
 * @param a
 * @param a_move
 * @param b
 * @param b_move
 * @return Returns a list of simulation moves that represent all the ways these two polycubes could join at the specified moves
 */
std::vector<const SimulationMove*> PolycubesSimulation::alignPolycubes(const Polycube *a,
                                                                       const Move& a_move,
                                                                       const Polycube *b,
                                                                       const Move& b_move) const {
    std::vector<const SimulationMove*> simMoves;

    // So what we're going to do here is construct a series of affine transformations
    // which will line up these two polycubes
    // it's VERY IMPORTANT that the affine translations are multiplied together in the correct
    // order!!!!
    // order must be: global translate, rotate dir, rotate ori, local translate

    // construct a transform to translate b so that b_move is at the coordinate origin
    Eigen::Affine3f global_translate = Eigen::Affine3f::Identity();
    global_translate.translation() = -b_move.pos().cast<float>();
    // check global transform
    ASSERT(veceq(global_translate * b_move.pos().cast<float>(), Eigen::Vector3f::Zero()), "Global transform incorrect!");

    // align faces to face each other
    // compute quaternion rotation between a and b
    // we can disregard the global transform here
    Eigen::Quaternionf q = Eigen::Quaternionf::FromTwoVectors(b_move.fdir(),
                                                              -a_move.fdir());

    ASSERT(veceq(q * b_move.fdir(), -a_move.fdir()), "First transform quatnerion incorrect!");
    Eigen::Affine3f directional_rot(q); // affine transform from quaternion

    // construct a transform to translate b so that b_move is positioned
    // adjacent to a_move binding site
    Eigen::Affine3f local_translate = Eigen::Affine3f::Identity();
    local_translate.translation() = a_move.pos().cast<float>() + a_move.fdir();
    ASSERT(veceq(a_move.pos().cast<float>() + a_move.fdir(),
                 global_translate * directional_rot * local_translate * b_move.pos().cast<float>()),
           "Local translation incorrect!");

    // if torsion
    if (hasTorsion()) {
        // compute torsion angle between a_move and b_move
        // we can ignore translations here
        Eigen::Quaternionf q2 = Eigen::Quaternionf::FromTwoVectors(
                a_move.fori(),
                q * b_move.fori());
        ASSERT(veceq(a_move.fori(), q * q2 * b_move.fori()), "Second treansform quaternaion incorrect!");
        Eigen::Affine3f tortional_rot(q2);

        // combine transforms like I said at the beginning of this function
        Eigen::Affine3f transform_product = global_translate * directional_rot * tortional_rot * local_translate;

        const FormConnectionPcPcSM* simMove = new FormConnectionPcPcSM(a, b, a_move, b_move, transform_product);
        if (simMove->isValid(*this)) {
            simMoves.push_back(simMove);
        }
    } else {
        for (int idx = 0; idx < 4; idx++) {
            float theta = M_PI * 2 * (idx/4); // get angle in radians
            // construct an axis angle
            Eigen::AngleAxisf axis_angle(theta, q * a_move.fori());
            Eigen::Affine3f tortional_rot(axis_angle);

            // combine transforms like I said at the beginning of this function
            Eigen::Affine3f transform_product = global_translate * directional_rot * tortional_rot * local_translate;
            FormConnectionPcPcSM* simMove = new FormConnectionPcPcSM(a, b, a_move, b_move, transform_product);
            if (simMove->isValid(*this)){
                simMoves.push_back(simMove);
            }
        }
    }
    return simMoves;
}

void PolycubesSimulation::logHistory() {
    /**
     * Adds the most recent step to the historical record vector
     * WARNING: calling this more than once per step will create ISSUES
     * does NOT log to json
     */
    m_History.emplace_back(); // add empty vector to end
    m_History[m_History.size() - 1].polycubes.reserve(getNumPolycubes()); // allocate space
    for (int i = 0; i < getNumPolycubes(); i++){
        // clone polycubes
        m_History[m_History.size() - 1].polycubes.push_back(getPolycubeByIdx(i)->clone());
    }
}

void PolycubesSimulation::step() {
    // get possible simulation moves
    std::vector<const SimulationMove*> simulationMoves = getPotentialSimulationMoves();

    // TODO: make this algorithm better

    // construct weighted list
    // create vector
    std::vector<int> moveIdxs;
    // loop simulation moves
    for (int i = 0; i < simulationMoves.size(); i++){
        // add this simulation move's idx, at a count equal to the move's multiplicity
        moveIdxs.resize(moveIdxs.size() + simulationMoves[i]->multiplicity(*this), i);
    }

    // shuffle connections
    std::shuffle(moveIdxs.begin(), moveIdxs.end(), rng);

    int stepMoveCount = 0;
    float prob;
    float randnum;
    for (int i = 0; i < moveIdxs.size() && stepMoveCount < getMaxSimMovesPerStep(); i++) {
        const SimulationMove* simMove = simulationMoves[moveIdxs[i]];
        spdlog::info("Randomly chose move " + simMove->to_string() + " (" + std::to_string(i) + ") in list. Evaluating...");
        // connection may have been valid before but invalidated in a previous cycle of this loop
        if (simMove->isValid(*this)){
            prob = simMove->probability(*this);
            randnum = (float) rng() / (float) rng.max();
            spdlog::info("Move valid. Move probability: " + std::to_string(prob)
                    + ". Generated random number " + std::to_string(randnum));
            if (prob > randnum) {
                // fire the move!!!
                simMove->execute(*this);
                stepMoveCount++;
                spdlog::info("Executed move " + simMove->to_string() + "! Remaining moves this step: " + std::to_string(getMaxSimMovesPerStep() - stepMoveCount));
            }
        }
        else {
            spdlog::info("Move no longer valid. Continuing...");
        }
        // do NOT pop simulation moves!!! will fuck the index!!
        // if it's disabled by the move, isValid will return false
    }

    checkCubeIDs();

    for (auto sm : simulationMoves){
        delete sm;
    }
    m_iStepCount++;
    logHistory();
}

/**
 * Checks to make sure that each cube is only present once
 */
void PolycubesSimulation::checkCubeIDs() const {
    // create set of all cube instance IDs
    // this may not be just "all IDs less than num instances"
    std::set<int> cubeIDs;
    for (auto &c : m_CubeList){
        cubeIDs.emplace(c.get()->getID());
    }

    // loop polycubes
    for (int i = 0; i < getNumPolycubes(); i++){
        Polycube* p = m_Polycubes[i].get();
        // loop cubes in polycube
        for (auto &c : p->getCubes()){
            // if the ID of this cube isn't in that set, raise a row
            ASSERT(cubeIDs.count(c->getID()) == 1, "Cube ID " << c->getID() << " not found (duplicate?)");
            // remove the ID from that set
            cubeIDs.erase(c->getID());
        }
    }
    ASSERT(cubeIDs.size() == 0, "Not all cube IDs accounted for!");
}

void PolycubesSimulation::run() {
    while (m_iStepCount < maxSteps()){
        step();
    }
}

std::set<int> PolycubesSimulation::stepIdxsSoFar(int interval) const {
    std::set<int> stepIdxs;
    for (int i = 0; i < currentStep(); i += interval){
        stepIdxs.insert(i);
    }
    return stepIdxs;
}

nlohmann::json PolycubesSimulation::json(std::set<int> timepoints) const {
    nlohmann::json j;
    j[JSON_SETUP_KEY] = params().json();
    // dump history
    j[JSON_SIM_HISORY_KEY] = nlohmann::json::array();
    for (int iStep : timepoints){
        nlohmann::json jh;
        const HistoricalRecord& record = getRecord(iStep);
        jh << record;
        // if we're being thorough, append cube type info to each polycube
        j[JSON_SIM_HISORY_KEY].push_back(jh);
    }
    return j;
}
