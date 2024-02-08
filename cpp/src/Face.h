//
// Created by josh on 5/14/23.
//

#ifndef POLYCUBES_FACE_H
#define POLYCUBES_FACE_H

#include <Eigen/Core>
#include <nlohmann/json.hpp>

#include "utils.h"
// Face-family of classes
// Faces are defined by 3 traits: a direction vector, an orientation vector, and a color
// (Orientation vector is ignored by non torsional systems)
// All Face-like objects are immutable

// face json dir keys
const std::string JSON_FACE_DIR_KEY = "face_dir";
const std::string JSON_FACE_ORI_KEY = "face_ori";
const std::string JSON_FACE_COLOR_KEY = "face_color";

// patch json state and activation var keys
const std::string JSON_PATCH_STATE_VAR_KEY = "face_state_var";
const std::string JSON_PATCH_ACTIVATION_VAR_KEY = "face_activation_var";

// move json var keys
const std::string JSON_MOVE_POS_KEY = "move_pos";

class Face {
public:
    Face(VECTOR direction, VECTOR orientation, int color);
    VECTOR dir() const;
    DirIdx dirIdx() const;
    VECTOR ori() const;
    int color() const;
    Face operator*(Eigen::Quaternionf q) const;
    nlohmann::json toJSON() const;
protected:
    const VECTOR m_Dir;
    const VECTOR m_Ori;
    const int m_iColor;
};

class Patch : public Face{
public:
    Patch(VECTOR direction, VECTOR orientation, int color, int stateVar=0, int activationVar=0);
    int stateVar() const;
    int activationVar() const;
    Patch operator*(Eigen::Quaternionf q) const;
    nlohmann::json toJSON() const;
protected:
    Patch(const Face& f, int stateVar=0, int activationVar=0);
    const int m_iStateVar;
    const int m_iActivationVar;
};

class Move : public Face {
public:
    Move(VECTOR position, VECTOR direction, VECTOR orientation, int color);
    Move(const Face& f, VECTOR position);
    VECTOR pos() const;
    Move operator*(Eigen::Quaternionf q) const;
    nlohmann::json toJSON() const;
    std::string to_string() const; // TODO: consider making this a method of the superclass
protected:
    const VECTOR m_Pos;
};

void operator<<(nlohmann::json& j, const Patch& patch);

#define fori ori().cast<float>
#define fdir dir().cast<float>

#endif //POLYCUBES_FACE_H
