//
// Created by josh on 5/12/23.
//

#ifndef POLYCUBES_POLYCUBESSIMULATION_H
#define POLYCUBES_POLYCUBESSIMULATION_H

#include <map>
#include <chrono>

#include "CubeType.h"
#include "Polycube.h"
#include "PolycubesAssemblyGraph.h"

// json keys
const std::string JSON_SETUP_KEY                        = "setup";
const std::string JSON_SIM_HISORY_KEY                   = "history";

const std::string JSON_CUBE_TYPES_KEY                   = "cube_types";

// simulation parameter keys
const std::string TORSION_KEY               = "torsion";
const std::string DEPLETES_TYPES_KEY        = "depletes_types";
const std::string TEMPERATURE_KEY           = "temperature";
const std::string DENSITY_KEY               = "density";
const std::string RULE_KEY                  = "rule";
const std::string START_LEVELS_KEY          = "start_levels";
const std::string INTERACTION_MATRIX_KEY    = "interaction_matrix";
const std::string NUM_STEPS_KEY             = "num_steps";
const std::string RAND_SEED_KEY             = "rand_seed";

// history keys
const std::string JSON_SIM_HISTORY_STEP_NUMBER_KEY      = "step_number";
const std::string JSON_SIM_HISTORY_POLYCUBES_KEY        = "polycubes";
const std::string JSON_SIM_HISTORY_CUBES_KEY            = "cubes";

class SimulationMove; //avoid circular includes

struct SimulationParameters {
    bool torsion;
    bool depletes_types;
    float temperature;
    float density;
    std::vector<CubeType> cube_types;
    std::vector<int> cube_type_start_lvls;
    int numSteps;
    std::map<std::pair<int, int>, float> interactionMatrix;
    unsigned randSeed = std::chrono::system_clock::now().time_since_epoch().count();

    SimulationParameters dupliacte(int seedChange = -1) const;
    nlohmann::json json() const;

    int max_color() const;
};

SimulationParameters simParamsFromJSONFile(std::string filepath);

struct HistoricalRecord {
    int step;
    std::vector<std::unique_ptr<Polycube, PolycubeDeleter>> polycubes;
    int numPolycubes() const;
    int numCubeInstances() const;
};

void operator<<(nlohmann::json& j, const HistoricalRecord& record);

/**
 *
 */
class PolycubesSimulation : public PolycubesAssemblyGraph {
public:
    PolycubesSimulation(SimulationParameters simParams);
    ~PolycubesSimulation();

    // Accessors
    bool hasTorsion() const;
    bool isDepletesTypes() const;
    float getTemperature() const;
    float getDensity() const;
    int numCubeTypes() const;
    CubeType getCubeType(int idx) const;
    int getCTStartLvl(int idx) const;
    int getCTLvl(int idx) const;
    int getNumPolycubes() const;
    int getPolycubeMaxID() const;
    Polycube * getPolycubeByIdx(int idx);
    Polycube * getPolycubeByID(int idx) const;
    bool hasPolycube(int id) const;
    std::vector<std::pair<const Polycube *, const Polycube *>> polycubePairs() const;

    void addPolycube(std::vector<CubeInstance*> cubes, std::set<Connection> edges);

    int numCubes() const;
    CubeInstance* getCubeByID(int id) const;
    bool cubeExists(int id) const;
    int getMaxSimMovesPerStep() const;
    int currentStep() const;
    int maxSteps() const;
    float interaction(int c1, int c2) const;
    float interaction(const Patch& p1, const Patch& p2) const;
    SimulationParameters params() const;

    // record keeping
    const HistoricalRecord& getRecord(int iStep) const;

    // Simulation methods
    CubeInstance* instantiateCube(int cubeTypeIdx);
    void step();
    void run();
    std::vector<const SimulationMove *> getPotentialSimulationMoves() const;
    std::vector<const SimulationMove *> getCubeCubeSimMoves() const;
    std::vector<const SimulationMove *> getAddCubeSimMoves(const std::unique_ptr<Polycube> &pc, int &counter) const;
    std::vector<const SimulationMove *> getJoinPolycubeSimMoves() const;

    std::vector<const SimulationMove *> getFormInternalConnectionMoves(const Polycube *pc) const;
    std::vector<const SimulationMove *> alignPolycubes(const Polycube *a,
                                                      const Move& a_move,
                                                      const Polycube *b,
                                                      const Move& b_move) const;

    // debug methods
    void checkCubeIDs() const;

    std::set<int> stepIdxsSoFar(int interval = 1) const;

    nlohmann::json json(std::set<int> timepoints) const;

protected:
    void logHistory();
    const SimulationParameters m_SimParams;
    // simulation parameters (constant)
//    const bool m_bTorsion;
//    const bool m_bDepleteCubeTypes;
//    const float m_fTemperature;
//    const float m_fDensity;
//    const int m_iMaxSteps;
//    const std::vector<CubeType> m_CubeTypes;
//    const std::vector<int> m_CubeTypeStartLevels;
//    std::map<std::pair<int, int>, float> m_InteractionMatrix;

    // runtime variables
    int m_iStepCount;
    std::vector<int> m_CubeTypeLevels;
    // list of polycubes present in current step
    std::vector<std::unique_ptr<Polycube>> m_Polycubes;
    // map of refs to polycubes, by ID
    std::map<int, Polycube*> m_PolycubeMap;
    // "Master list" of cube objects. Polycube objects use pointers to this list.
    std::vector<std::unique_ptr<CubeInstance>> m_CubeList;
    // cube ID map for quick reference
    std::map<int, CubeInstance*> m_CubeIDMap;
    // cube ID counter
    int m_iCubeIDCounter;
    // polycube ID counter
    int m_iPolycubeIDCounter;
    //Mersenne Twister random number generator
    std::mt19937 rng;
    // log of past steps
    std::vector<HistoricalRecord> m_History;

};


#endif //POLYCUBES_POLYCUBESSIMULATION_H
