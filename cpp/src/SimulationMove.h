//
// Created by josh on 5/20/23.
//

#ifndef POLYCUBES_SIMULATIONMOVE_H
#define POLYCUBES_SIMULATIONMOVE_H

#include "Face.h"
#include "utils.h"
#include "Effect.h"

// json keys
const std::string JSON_SM_TYPE_KEY                  = "move_type";
const std::string JSON_SM_TARGET_ID_KEY             = "target_id";
const std::string JSON_SM_POLYCUBE_MOVE_KEY         = "pc_move";
const std::string JSON_SM_CUBE_MOVE_KEY             = "c_move";
const std::string JSON_SM_CUBE_ID_KEY               = "cube_inst_id";
const std::string JSON_SM_POLYCUBE_TRANSFORM_KEY    = "pc_transform";
const std::string JSON_EFFECT_KEY                   = "effect";

// pre-define PolycubesSimulation and Polycube
class PolycubesSimulation;
class Polycube;

class SimulationMove {
public:
    [[nodiscard]] virtual bool isValid(const PolycubesSimulation &sim) const {};
    [[nodiscard]] virtual float probability(const PolycubesSimulation &sim) const {};

    virtual void execute(PolycubesSimulation &sim) const{};
    [[nodiscard]] virtual nlohmann::json toJSON() const{};
    [[nodiscard]] virtual std::string to_string() const{};
    [[nodiscard]] virtual int multiplicity(const PolycubesSimulation& sim) const {return 1;};
};

// Class that holds the few methods common to all SimulationMoves that form a connection
// this class has no public-facing constructor because it should never be instantiated!
class FormConnectionSM : public SimulationMove {
protected:
    FormConnectionSM(int idx1, Move move1, int idx2, Move move2);
    const int a_id, b_id; // the index in WHAT varies depending on subclass!
    const Move a_move, b_move;
public:
    [[nodiscard]] bool isValid(const PolycubesSimulation &sim) const override;
    [[nodiscard]] nlohmann::json toJSON() const override;
};

// A simulation move that forms a connection between two polycubes
class  FormConnectionPcPcSM : public FormConnectionSM {
protected:
    const Eigen::Affine3f t; // this is derivable from a_move and b_move but is kept for mem saving
public:
    static const std::string NAME;
    FormConnectionPcPcSM(const Polycube *a, const Polycube *b, const Move &a_move, const Move &b_move,
                         const Eigen::Affine3f b_transform);

    // overriding methods
    [[nodiscard]] bool isValid(const PolycubesSimulation &sim) const override;
    virtual void execute(PolycubesSimulation &sim) const override;
    [[nodiscard]] nlohmann::json toJSON() const override;
    [[nodiscard]] float probability(const PolycubesSimulation &sim) const override;
    [[nodiscard]] std::string to_string() const override;

    // helper methods
    [[nodiscard]] Polycube * get_a(const PolycubesSimulation &sim) const;
    [[nodiscard]] Polycube * get_b(const PolycubesSimulation &sim) const;

};

// a simulation move that forms a connection between a polycube and a cube
class FormConnectionPcCSM : public FormConnectionSM {
public:
    const static std::string NAME;

    FormConnectionPcCSM(const Polycube *pc, const Move &pc_move, int cidx, const Move &cube_move);

    // overriding methods
    [[nodiscard]] bool isValid(const PolycubesSimulation &sim) const override;
    void execute(PolycubesSimulation &sim) const override;
    [[nodiscard]] nlohmann::json toJSON() const override;
    float probability(const PolycubesSimulation &sim) const override;
    std::string to_string() const override;
    int multiplicity(const PolycubesSimulation& sim) const override;

    // helper methods
    const Move& polycubeMove() const;
    const Move& cubeMove() const;
    int getCubeTypeIdx() const {return b_id;};
    Polycube * polycube(const PolycubesSimulation &sim) const;
};

// a simulation move that forms a connection between two cubes, forming a polycube
class FormConnectionCCSM : public FormConnectionSM {
public:
    const static std::string NAME;

    FormConnectionCCSM(int idx1, const Move &move1, int idx2, const Move &move2) : FormConnectionSM(idx1, move1, idx2, move2){}

    bool isValid(const PolycubesSimulation &sim) const override;
    void execute(PolycubesSimulation &sim) const override;
    nlohmann::json toJSON() const override;
    float probability(const PolycubesSimulation &sim) const override;
    std::string to_string() const override;
    int multiplicity(const PolycubesSimulation& sim) const override;

};

class InternalConnectionSM : public SimulationMove {
protected:
    int target;
    int cube_a_idx;
    int cube_b_idx;
public:

    InternalConnectionSM(int target, int c1idx, int c2idx);
    nlohmann::json toJSON() const override;

    Polycube * getTarget(const PolycubesSimulation &sim) const;
    const CubeInstance* cube_a(const PolycubesSimulation& sim) const;
    const CubeInstance* cube_b(const PolycubesSimulation& sim) const;
    Patch patch_a(const PolycubesSimulation &sim) const;
    Patch patch_b(const PolycubesSimulation &sim) const;
};

class FormInternalConnectionSM : public InternalConnectionSM {
public:
    FormInternalConnectionSM(int target, int c1idx, int c2idx) : InternalConnectionSM(target, c1idx, c2idx) {}

    const static std::string NAME;

    bool isValid(const PolycubesSimulation &sim) const override;
    void execute(PolycubesSimulation &sim) const override;
    nlohmann::json toJSON() const override;
    float probability(const PolycubesSimulation &sim) const override;
    std::string to_string() const override;
};

// a connection between two cubes in a polycube breaks
class BreakInternalConnectionSM : public InternalConnectionSM {
public:
    BreakInternalConnectionSM(int target, int c1idx, int c2idx) : InternalConnectionSM(target, c1idx, c2idx) {}

    const static std::string NAME;

    bool isValid(const PolycubesSimulation &sim) const override;
    nlohmann::json toJSON() const override;
    void execute(PolycubesSimulation &sim) const override;
    float probability(const PolycubesSimulation &sim) const override;
    std::string to_string() const override;
};

// a dynamic effect fires
class EffectSM : public SimulationMove {
protected:
    // has to be a pointer so polymorphism for different Effect subclasses to work properly.
    std::shared_ptr<Effect> e;
    int cubeID; // cube INSTANCE id
public:
    const static std::string NAME;

    EffectSM(std::shared_ptr<Effect> e, int cubeID);
    bool isValid(const PolycubesSimulation &sim) const override;
    void execute(PolycubesSimulation &sim) const override;
    nlohmann::json toJSON() const override;
    float probability(const PolycubesSimulation &sim) const override;
    std::string to_string() const override;
};

void alignCube(CubeInstance* b, const Move& a_move, const Move& b_move);

#endif //POLYCUBES_SIMULATIONMOVE_H
