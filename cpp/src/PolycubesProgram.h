//
// Created by josh on 5/15/23.
//

#ifndef POLYCUBES_POLYCUBESPROGRAM_H
#define POLYCUBES_POLYCUBESPROGRAM_H

#include <getopt.h>

#include "PolycubesSimulation.h"



int flag_use_json;

const char *const short_opts = "hr:ti:s:";
static struct option long_options[] {
        {"help", no_argument, nullptr, 'h'},
        {"rule", required_argument, nullptr, 'r'},
        {"torsion", optional_argument, nullptr, 't'},
        {"input", required_argument, &flag_use_json, 'i'},
        {"nsteps", optional_argument, nullptr, 's'},
        {"simcount", optional_argument, nullptr, 'c'},
        {"programname", optional_argument, nullptr, 'n'}
};

// TODO: flesh this out for the love of god please
/**
 *
 */
class PolycubesProgram {
public:
    PolycubesProgram(SimulationParameters simParams, std::string programName, int count = 1);
    std::string name() const;
    std::string simDir(int i) const;
    int numSims() const;
    PolycubesSimulation * sim(int i) const;
    void dumpSimData(int iSimIdx, std::set<int> timepoints, std::string fileName) const;
    void dumpSimData(int iSimIdx, std::string fileName="") const;
    void dumpSimData(int iSimIdx) const;
    int run();
protected:
    const std::string m_ProgramName;
    const SimulationParameters m_SimParams;
    std::vector<std::unique_ptr<PolycubesSimulation>> m_Sims;
};


#endif //POLYCUBES_POLYCUBESPROGRAM_H
