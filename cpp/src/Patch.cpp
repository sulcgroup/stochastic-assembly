//
// Created by josh on 5/14/23.
//

#include "Face.h"

Patch::Patch(VECTOR direction, VECTOR orientation, int color, int stateVar, int activationVar) :
       Face(direction, orientation, color),
       m_iActivationVar(activationVar),
       m_iStateVar(stateVar){
}

Patch::Patch(const Face &f, int stateVar, int activationVar) :
    Face(f),
    m_iActivationVar{activationVar},
    m_iStateVar{stateVar} {

}

int Patch::stateVar() const {
    return m_iStateVar;
}

int Patch::activationVar() const {
    return m_iActivationVar;
}

Patch Patch::operator*(Eigen::Quaternionf q) const {
    return {
        Face::operator*(q),
        stateVar(),
        activationVar()
    };
}

nlohmann::json Patch::toJSON() const {
    nlohmann::json j = Face::toJSON();
    j[JSON_PATCH_STATE_VAR_KEY] = stateVar();
    j[JSON_PATCH_ACTIVATION_VAR_KEY] = activationVar();
    return j;
}


void operator<<(nlohmann::json &j, const Patch &patch) {
    j["dir"] = json_xyz(patch.dir());
    j["alignDir"] = json_xyz(patch.ori());
    j["color"] = patch.color();
    j["state_var"] = patch.stateVar();
    j["activation_var"] = patch.activationVar();
}
