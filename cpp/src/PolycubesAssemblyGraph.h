//
// Created by josh on 5/25/23.
//

#ifndef POLYCUBES_POLYCUBESASSEMBLYGRAPH_H
#define POLYCUBES_POLYCUBESASSEMBLYGRAPH_H

#include <set>
#include "SimulationMove.h"

// TODO: READ PAPERS ON CRNS, FINISH WRITING THIS LIKE AN ADULT

struct AssemblyGraphNode{
    const int polycubeID; // make sure to crossref this with graph order, position in chain between steps if applicable
    const bool isIntermediate;
};

struct AssemblyGraphEdge{
    const AssemblyGraphNode* origin;
    const AssemblyGraphNode* destination;
    const std::unique_ptr<SimulationMove> operation;
    const int startStep;

    AssemblyGraphEdge(const AssemblyGraphEdge& original);
};

/**
 * do not let the similarities with Polycube structural graphs confuse you,
 * this is ENTIRELY different. the assembly graph is unidirectional, where
 * each node is a polycube, fixed in time, and each edge is a SimulationMove that was carried out on the
 * polycube at origin
 */
class PolycubesAssemblyGraph {
protected:
    std::set<AssemblyGraphNode> m_AssemblyGraphNodes;
    std::set<AssemblyGraphEdge> m_AssemblyGraphEdges;
};


#endif //POLYCUBES_POLYCUBESASSEMBLYGRAPH_H
