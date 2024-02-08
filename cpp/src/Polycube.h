//
// Created by josh on 5/12/23.
//

#ifndef POLYCUBES_POLYCUBE_H
#define POLYCUBES_POLYCUBE_H

#include "CubeInstance.h"
#include <random>
#include <set>

class Polycube;

// Custom deleter
// KILL YOUR DOUBLE
struct PolycubeDeleter {
    void operator()(Polycube* polycube) const;
};

class Polycube {
    friend struct PolycubeDeleter;
public:
   Polycube(int id);
   Polycube(int id, std::vector<CubeInstance *> cubes, std::set<Connection> edges);
   // moves
   std::vector<Move> getMoves() const;

   int getID() const;

   // cubes
   bool hasCube(VECTOR position) const;
   bool hasCube(int id) const;
   CubeInstance* getCube(VECTOR v) const;
   CubeInstance* getCubeByID(int id) const;
   CubeInstance* getCubeByIdx(int idx) const;
   const std::vector<CubeInstance*>& getCubes() const;
   int getNumCubes() const;
   void addCube(CubeInstance* inst, Connection c);

   // moves, etc.
   bool moveExists(const Move& move) const;
   bool overlaps(const Polycube *other) const;

   void combine(const Polycube *b, std::set<Connection> edges);

   std::unique_ptr<Polycube, PolycubeDeleter> clone(Eigen::Affine3f transform = Eigen::Affine3f::Identity()) const;
   void transform(const Eigen::Affine3f t);

   // simulation move methods
   std::vector<const SimulationMove*> getBreakInternalConnectionMoves() const;
protected:
    void addCube(CubeInstance *instance);

    // ad-hoc graph theory library
public:
   void addConnection(Connection e);
   bool isConnected() const;
   void breakConnection(Connection e);
   bool hasConnection(Connection e) const;
   const std::set<Connection>& getConnections() const;
protected:
    std::set<int> getConnectedCubes(int startID) const;

protected:
    const int m_PolycubeID;

    std::vector<CubeInstance*> m_Cubes;
    std::map<VectorKey, CubeInstance*> m_CubePositionMap;
    std::map<int, CubeInstance*> m_CubeIDMap;

    // set of all edges of the graph
    std::set<Connection> m_PolycubeGraph;
};

void operator<<(nlohmann::json& j, const Polycube* polycube);

#endif //POLYCUBES_POLYCUBE_H
