//
// Created by josh on 5/14/23.
//

#include "Face.h"

Face::Face(VECTOR direction, VECTOR orientation, int color) :
        m_Dir(direction),
        m_Ori(orientation),
        m_iColor(color) {
    ASSERT(color != 0, "Faces cannot have color of 0");
    ASSERT(direction.dot(orientation) == 0, "Orientation and/or direction vector invalid!");
}

VECTOR Face::dir() const {
    return m_Dir;
}

DirIdx Face::dirIdx() const {
    return diridx(m_Dir);
}

VECTOR Face::ori() const {
    return m_Ori;
}

int Face::color() const {
    return m_iColor;
}

Face Face::operator*(Eigen::Quaternionf q) const {
    return {
            ROUND((q * fdir())),
            ROUND((q * fori())),
            color()
    };
}

nlohmann::json Face::toJSON() const {
    nlohmann::json j;
    j[JSON_FACE_DIR_KEY] = dir();
    j[JSON_FACE_ORI_KEY] = ori();
    j[JSON_FACE_COLOR_KEY] = color();
    return j;
}