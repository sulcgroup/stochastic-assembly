//
// Created by josh on 5/15/23.
//

#include "PolycubesProgram.h"
#include <filesystem>
#include <fstream>

#define OUTPUT_FOLDER getenv("HOME") + std::string("/.pypatchy/output/tlm/")

PolycubesProgram::PolycubesProgram(SimulationParameters simParams, std::string programName, int count) :
        m_SimParams{simParams},
        m_ProgramName{programName} {
    std::filesystem::create_directories(OUTPUT_FOLDER + name());
    for (int i = 0; i < count; i++){
        std::filesystem::create_directories(OUTPUT_FOLDER + name() + "/simulation_" + std::to_string(i));
        SimulationParameters individualParams = simParams.dupliacte(i); // change seed by predictable amt
        m_Sims.emplace_back(std::unique_ptr<PolycubesSimulation>(new PolycubesSimulation(simParams)));
    }
}

std::string PolycubesProgram::name() const {
    return m_ProgramName;
}

std::string PolycubesProgram::simDir(int i) const {
    return OUTPUT_FOLDER + name() + "/simulation_" + std::to_string(i);
}

int PolycubesProgram::numSims() const {
    m_Sims.size();
}

PolycubesSimulation * PolycubesProgram::sim(int i) const {
    ASSERT(i > -1, "Index out of bounds!");
    ASSERT(i < m_Sims.size(), "Index out of bounds!");
    return m_Sims.at(i).get();
}

/**
 * export simulations in such a way that it can be imported to the web app for examination
 * @param iSimIdx
 * @param thorough
 */
void PolycubesProgram::dumpSimData(int iSimIdx, std::set<int> timepoints, std::string fileName) const {
    nlohmann::json j = sim(iSimIdx)->json(timepoints);

    std::ofstream outfile(simDir(iSimIdx) + "/" + fileName + ".json");
    outfile << std::setw(4) << j << std::endl;
}

void PolycubesProgram::dumpSimData(int iSimIdx, std::string fileName) const {
    std::set<int> timepoints;
    for (int i = 0; i < sim(iSimIdx)->currentStep(); i++){
        timepoints.emplace(i);
    }
    dumpSimData(iSimIdx, timepoints, fileName);
}

void PolycubesProgram::dumpSimData(int iSimIdx) const {
    dumpSimData(iSimIdx, "history");
}

int PolycubesProgram::run() {
    /**
     * Executes simulations
     * Each simulation is treated as completely independant
     */
    // buffer output continuously or step-by-step?
    // run simulations parallel or serially?
    // let's go serially, all at once
    for (int i = 0; i < numSims(); i++) {
        while(sim(i)->currentStep() < sim(i)->maxSteps()){
            sim(i)->step();
            std::set<int> steps = sim(i)->stepIdxsSoFar();
            dumpSimData(i, steps,
                        "sim" + std::to_string(i));// + "_step" + std::to_string(sim(i)->currentStep()));
        }
//        sim(i)->run();
//        dumpSimData(i, false);
    }
}


// main function
int main(int argc, char* argv[]) {

    // TODO: make log file specifiable
    auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(OUTPUT_FOLDER + "logfile.txt", true);
    auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();

    auto logger = std::make_shared<spdlog::logger>("logger", spdlog::sinks_init_list{file_sink, console_sink});
    spdlog::register_logger(logger);

    // Set the logging level
    spdlog::set_level(spdlog::level::debug);
    spdlog::set_default_logger(logger);

    flag_use_json = 0;

    ASSERT(argc > 0, "Not enough args");
    int ch;
    std::string rule;
    SimulationParameters simParams;

    // default values for temperature, density, etc. to mimic Polycubes and Polycubes2 behavior
    simParams.density = 1;
    simParams.temperature = 0;
    simParams.depletes_types = false;

    simParams.torsion = true;
    simParams.numSteps = 1e3; // default: 1000 steps
    // default name: grab from clock
    std::string programName = "sim_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());

//    simParams.randSeed = 69; // for debugging consistancy - remove for test!!!

    int nReps = 1;
    while ((ch = getopt_long(argc, argv, short_opts, long_options, NULL)) != -1) {
        switch (ch) {
            case 'h':
                // print help text and exit
                std::cout << "TODO: WRITE HELP TEXT" << std::endl;
                exit(0);
            case 'r':
                simParams.cube_types = parseRule(optarg);
                spdlog::info("Setting cube types from rule " + std::string(optarg));
                break;
            case 't':
                simParams.torsion = optarg == "true";
                spdlog::info("Setting torsion to " + std::to_string(simParams.torsion));
                break;
            case 'i':
                spdlog::info("Loading simulation parameters from file " + std::string(optarg));
                simParams = simParamsFromJSONFile(optarg);
                break;
            case 's':
                simParams.numSteps = std::stoi(optarg);
                spdlog::info("Setting number of steps " + std::to_string(simParams.numSteps));
                break;
            case 'c':
                nReps = std::stoi(optarg);
                spdlog::info("Based on input, setting number of simulations to " + std::to_string(nReps));
                break;
            case 'n':
                programName = optarg;
                break;
        }
    }

    if (!flag_use_json){
        simParams.cube_type_start_lvls = {};
        simParams.cube_type_start_lvls.resize(simParams.cube_types.size(), 1);
    }

    // user did not provied an interaction matrix, generate
    if (simParams.interactionMatrix.size() == 0){
        auto [min, max] = getRuleColorRange(simParams.cube_types);
        int absmax = std::max(std::abs(min), max);
        for (int i = 1; i <= absmax; i++){
            simParams.interactionMatrix[{-i, i}] = 1; // every color interacts with its opposite
        }
    }

    PolycubesProgram p(simParams, programName);
    p.run();
}