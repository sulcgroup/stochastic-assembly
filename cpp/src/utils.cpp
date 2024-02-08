//
// Created by josh on 5/14/23.
//

#include <regex>
#include <chrono>
#include <boost/regex.hpp>
#include "utils.h"


bool VectorKey::operator>(const VectorKey &v2) const {
    return std::hash<VectorKey>()(*this) > std::hash<VectorKey>()(v2);
}

bool VectorKey::operator<(const VectorKey &v2) const {
    return v2 > *this;
}

bool VectorKey::operator==(const VectorKey& v2) const {
//        //http://www.alecjacobson.com/weblog/?p=4294
//        return std::lexicographical_compare(
//                this->v.data(), this->v.data() + this->v.size(),
//                v2.v.data(), v2.v.data() + v2.v.size());
    return this->v == v2.v;
}

/*
 * returns the index of the passed vector in RULE_ORDER
 * Since this function is called a LOT, I've hardcoded this in order to make it faster
 * It's possible this could be optimized even further
 */
DirIdx diridx(VECTOR d) {
//    std::array<const VECTOR, ruleSize>::iterator it = std::find(RULE_ORDER.begin(), RULE_ORDER.end(), d);
//    return it != RULE_ORDER.end() ? it - RULE_ORDER.begin() : -1;
// if debug mode is on, check that direction is valid
    ASSERT(RULE_ORDER_REVERSE.contains(d), "Invalid direction [" << d.transpose() << "]");
    return RULE_ORDER_REVERSE.at(d);
}

int rdir(int diridx){
    // return getDirectionIndex(-RULE_ORDER[diridx]); slow, rigerous way
    return diridx % 2 == 1 ? diridx - 1 : diridx + 1; //faster, but makes me feel dirty
}

/*
 * returns the index of the passed vector in RULE_ORDER
 * Since this function is called a LOT, I've hardcoded this in order to make it faster
 * It's possible this could be optimized even further
 */
DirIdx diridxf(Eigen::Vector3f d) {
//    return getDirectionIndex(ROUND(d));
    if (std::round(d.x()) == -1)        {return LEFT;}
    else if (std::round(d.x()) == 1)    {return RIGHT;}
    else if (std::round(d.y()) == -1)   {return BOTTOM;}
    else if (std::round(d.y()) == 1)    {return TOP;}
    else if (std::round(d.z()) == -1)   {return BACK;}
    else if (std::round(d.z()) == 1)    {return FRONT;}
    else {return INVALID_DIR_IDX;}
}

// Make any -0 into 0
// Why does roundf even give us -0?
float noNeg0(float f) {
    return f==-0 ? 0 : f;
}

// Turn a vector into a string
std::string vecToStr(VECTOR v) {
    std::ostringstream oss;
    oss <<"("<<noNeg0(v.x())<<","<<noNeg0(v.y())<<","<<noNeg0(v.z())<<")";
    return oss.str();
}

std::string vecfToStr(Eigen::Vector3f v){
    std::ostringstream oss;
    oss <<"("<<noNeg0(v.x())<<","<<noNeg0(v.y())<<","<<noNeg0(v.z())<<")";
    return oss.str();
}

std::string constructCubeTypeName(int idx){
    return "CT" + std::to_string(idx);
}

bool isDecStatic(std::string sz) {
    boost::regex re("^(([^_]+(?=((?:-?\\d+:\\d+:(?:#\\d+:\\d+:[^#]+)*)+#*)+[^_]*)?)_?)+$");
    return boost::regex_match(sz, re);
}


bool isDecDynamic(std::string sz) {
    boost::regex re("^(([^_]+(?=((?:-?\\d+:\\d+:(?:#\\d+:\\d+:\\d+:\\d+)*)+#*)+[^_]*)?)_?)+$");
    return boost::regex_match(sz, re);
}


// https://stackoverflow.com/a/16544330
float getSignedAngle(
        VECTOR v1,
        VECTOR v2,
        VECTOR axis)
{
    float dot = v1.dot(v2);
    float det = axis.dot(v1.cross(v2));
    float a = atan2(det, dot);
    // std::cout<<"The angle from "<<vecToStr(v1)<<" to "<<vecToStr(v2)<<" around axis "<<vecToStr(axis)<<" is "<<a<<" ("<<a*M_1_PI*180<<" degrees)"<<std::endl;
    return a;
}

VECTOR getOrientation(DirIdx index, DirIdx orientation) {
    VECTOR v = RULE_ORDER[(index + 2) % RULE_ORDER.size()];
    const VECTOR dir = RULE_ORDER[index];
    const float angle = ((float) orientation) * M_PI_2;
    Eigen::AngleAxis<float> a = Eigen::AngleAxis<float>(
            angle, dir.cast<float>()
    );
    Eigen::Quaternion<float> q = Eigen::Quaternion<float>(a);
    return ROUND((q * v.cast<float>()));
}

// i suspect that this function already exists but can't find it
DirIdx getOrientationIdx(VECTOR direction, VECTOR orientation) {
    DirIdx didx = diridx(direction);
    return getOrientationIdx(didx, orientation);
}

DirIdx getOrientationIdx(int didx, VECTOR orientation) {
    VECTOR v = RULE_ORDER[(didx + 2) % RULE_ORDER.size()];
    return DirIdx(int(round((getSignedAngle(
            v, orientation, RULE_ORDER[didx]
    ) * 2 / M_PI) + 4)) % 4);
}

/**
 * helper method
 * @return milliseconds since the unix epoch
 */
long etime(){
    return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::system_clock::now().time_since_epoch()).count();
}

// Split string, from https://stackoverflow.com/a/10058725
std::vector<std::string> splitString(std::string s, char delim) {
    std::stringstream ss(s);
    std::string segment;
    std::vector<std::string> list;

    while(std::getline(ss, segment, delim))
    {
        list.push_back(segment);
    }
    return list;
}

bool isHex(const std::string& input) {
    std::regex regex("^([0-9A-Fa-f]{12})+$");
    return std::regex_match(input, regex);
}

nlohmann::json json_wxyz(Eigen::Quaternionf q) {
    nlohmann::json j;
    j["w"] = q.w();
    j["x"] = q.x();
    j["y"] = q.y();
    j["z"] = q.z();
    return j;
}

nlohmann::json json_xyz(Eigen::Vector3i v) {
    nlohmann::json j;
    j["x"] = v.x();
    j["y"] = v.y();
    j["z"] = v.z();
    return j;
}


