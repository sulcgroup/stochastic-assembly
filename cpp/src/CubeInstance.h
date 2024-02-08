//
// Created by josh on 5/14/23.
//

#ifndef POLYCUBES_CUBEINSTANCE_H
#define POLYCUBES_CUBEINSTANCE_H


#include <set>
#include "CubeType.h"
#include "utils.h"
#include "SimulationMove.h"

const std::string JSON_CUBE_TYPE_KEY        = "type";
const std::string JSON_CUBE_POSITION_KEY    = "position";
const std::string JSON_CUBE_ROTATION_KEY    = "rotation";
const std::string JSON_CUBE_STATE_KEY       = "state";


class Connection : public std::pair<const int, const int>{
    /**
    graph edge connecting two cube instances
    each int is an index in the global cube instance list
    cube graphs are undirected so {b,a} = {a,b}
    as such for consistancy indexes are in ascending order
     */
public:
    Connection(int a, int b) : std::pair<const int, const int>(a < b ? a : b, a < b ? b : a) {}
    [[nodiscard]] std::string str() const {
        return std::to_string(first) + "<->" + std::to_string(second);
    }
};

std::ostream& operator<<(std::ostream& ostr, const Connection& c);

class CubeInstance {
public:
    CubeInstance(const CubeType &cubeType, int uid);
    ~CubeInstance();
    [[nodiscard]] int getID() const;
    [[nodiscard]] const CubeType& getType() const;
    [[nodiscard]] Eigen::Quaternionf rotation() const;
    void rotate(Eigen::Quaternionf rot);
    void rotate(VECTOR v1, VECTOR v2);
    void rotateGlobal(Eigen::Quaternionf rot);
    [[nodiscard]] VECTOR position() const;
    void translate(VECTOR moveBy);
    [[nodiscard]] Patch patch(VECTOR direction) const;
    [[nodiscard]] bool hasPatch(VECTOR direction) const;
    [[nodiscard]] std::vector<bool> getState() const;
    void setState(const std::vector<bool>& newState);
    [[nodiscard]] bool getStateVar(int i) const;
    void setStateVar(int i, bool bNewVal=true);

    [[nodiscard]] std::vector<Face> getActiveFaces() const;

    // graph theory functions
    void addEdge(Connection e);
    void removeEdge(Connection e);
    void removeEdge(int otherID) {removeEdge(Connection(getID(), otherID));}
    bool hasEdge(Connection e);
    bool hasEdge(int otherID) {return hasEdge(Connection(getID(), otherID));}
    [[nodiscard]] std::set<int> getConnectedCubes() const;

    [[nodiscard]] std::vector<const SimulationMove *> getEffectSimMoves() const;

protected:
    const int m_iUID;
    const CubeType& m_Type;
    Eigen::Quaternionf m_Rotation;
    VECTOR m_Position;
    std::vector<bool> m_State;
    std::set<Connection> m_Connections;
};

void operator<<(nlohmann::json& j, const CubeInstance* c);

#endif //POLYCUBES_CUBEINSTANCE_H
