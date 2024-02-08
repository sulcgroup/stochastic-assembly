//
// Created by josh on 5/25/23.
//

#include "PolycubesAssemblyGraph.h"

/**
 * gotta explicitly define copy constructor so the std::unique_ptr doesn't throw a hissy fit
 * @param original
 */
AssemblyGraphEdge::AssemblyGraphEdge(const AssemblyGraphEdge &original) :
    origin{original.origin},
    destination{original.destination},
    operation{std::make_unique<SimulationMove>(*original.operation)}, // copy constructor for object at source of original
    startStep{original.startStep}
{

}