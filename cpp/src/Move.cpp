//
// Created by josh on 5/15/23.
//

#include "Face.h"

Move::Move(VECTOR position, VECTOR direction, VECTOR orientation, int color) :
        Face(direction, orientation, color),
        m_Pos(position){}

Move::Move(const Face &f, VECTOR position) :
        Face(f),
        m_Pos(position){

}

VECTOR Move::pos() const {
    return m_Pos;
}

Move Move::operator*(Eigen::Quaternionf q) const {
    return {
        Face::operator*(q),
        ROUND(( q * pos().cast<float>() ))
    };
}

nlohmann::json Move::toJSON() const {
    nlohmann::json j = Face::toJSON();
    j[JSON_MOVE_POS_KEY] = pos();
    return j;
}

std::string Move::to_string() const {
    std::stringstream ss; // gonna pay a speed penalty for this, todo: reconsider
    ss << "Move at position [" << pos().transpose() << "] facing [" << dir().transpose() << "] oriented [" << ori().transpose() << "] color " << color();
    return ss.str();
}
