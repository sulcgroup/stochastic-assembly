//
// Created by josh on 5/14/23.
//

#ifndef POLYCUBES_UTILS_H
#define POLYCUBES_UTILS_H

#include <Eigen/Dense>
#include <array>
#include <vector>
#include <spdlog/spdlog.h>
#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>

#include <iostream>
#include <random>
#include <set>
#include <map>
#include "nlohmann/json.hpp"

#define NEG_INF float.min()

/**
 * File for methods and values that aren't dependant on other header files within this project
 * Compare to utils.cpp and utils.hpp, which contain methods that are dependant on other header files
 */
// Message assert taken from thread https://stackoverflow.com/questions/3767869/adding-message-to-assert
#ifndef NDEBUG

#   define ASSERT(condition, message) \
    do { \
        if (! (condition)) { \
            std::cerr << "Assertion `" #condition "` failed in " << __FILE__ \
                      << " line " << __LINE__ << ": " << message << std::endl; \
            std::terminate(); \
        } \
    } while (false)
#else
#   define ASSERT(condition, message) do { } while (false)
#endif

#define VECTOR Eigen::Vector3i

#define ROUND(m) Eigen::round(m.array()).cast<int>()

class VectorKey {
public:
    VECTOR v;
    VectorKey(const VECTOR& v){
        this->v = v;
    };

    VectorKey(const Eigen::Vector3f& v) {
        this->v = ROUND(v);
    };

    VectorKey(const VectorKey& v) {
        this->v = v.v;
    }

    bool operator>(const VectorKey& v2) const;
    bool operator<(const VectorKey& v2) const;
    bool operator==(const VectorKey& v2) const;

    void operator=(VECTOR v){
        this->v = v;
    }
};

template <>
struct std::hash<VectorKey> {
    //https://stackoverflow.com/questions/20511347/a-good-hash-function-for-a-vector
    std::size_t operator()(const VectorKey& key) const {
        std::size_t seed = key.v.size();
        for(int i = 0; i < 3; i++) {
            seed ^= key.v[i] + 0x9e3779b9 + (seed << 6) + (seed >> 2);
        }
        return seed;
    }
};

enum DirIdx {
    INVALID_DIR_IDX=-1,
    LEFT,
    RIGHT,
    BOTTOM,
    TOP,
    BACK,
    FRONT,
    NUM_DIR_IDXS
};

const std::map<VectorKey, DirIdx> RULE_ORDER_REVERSE = {
        {VECTOR(-1, 0, 0), LEFT},
        {VECTOR( 1, 0, 0), RIGHT},
        {VECTOR( 0,-1, 0), BOTTOM},
        {VECTOR( 0, 1, 0), TOP},
        {VECTOR( 0, 0,-1), BACK},
        {VECTOR( 0, 0, 1), FRONT}
};

const std::array<VECTOR, NUM_DIR_IDXS> RULE_ORDER = {
        VECTOR(-1, 0, 0),
        VECTOR( 1, 0, 0),
        VECTOR( 0,-1, 0),
        VECTOR( 0, 1, 0),
        VECTOR( 0, 0,-1),
        VECTOR( 0, 0, 1)
};

DirIdx diridx(VECTOR d);
DirIdx diridxf(Eigen::Vector3f d);

#define veceq(a,b) (a - b).norm() < 1e-6

// Make any -0 into 0
float noNeg0(float f);

float getSignedAngle(
        VECTOR v1,
        VECTOR v2,
        VECTOR axis);

VECTOR getOrientation(DirIdx index, DirIdx orientation);
DirIdx getOrientationIdx(VECTOR direction, VECTOR orientation);
DirIdx getOrientationIdx(int didx, VECTOR orientation);

// I'm almost tempted to make these two macros
/**
 * shorthand method to iterate through a list and see if it contains an item
 * it's honestly weird that this isn't built in to the C++ standard lib
 * @tparam T
 * @param list
 * @param item
 * @return
 */
template<class T>
inline bool contains(std::vector<T> list, T item){
    return std::find(list.begin(), list.end(), item) != list.end();
}

std::string constructCubeTypeName(int idx);

long etime();

bool isHex(const std::string& sz);
bool isDecStatic(std::string sz);
bool isDecDynamic(std::string sz);

std::vector<std::string> splitString(std::string s, char delim);

template<class T>
std::vector<T> randOrdering(std::vector<T> to_reorder, std::mt19937& rng) {
    size_t size = to_reorder.size();

    // TODO: check if this algorithm is either good or even truly random
    // for each position in to_reorder:
    for (size_t i = size-1; i>0; i--) {
        // swap with a random position
        std::uniform_int_distribution<size_t> rnd_dist(0, i);
        size_t j = rnd_dist(rng);
        T temp = to_reorder[i];
        to_reorder[i] = to_reorder[j];
        to_reorder[j] = temp;
    }
    return to_reorder;
}

// code written by ChatGPT. god help us all
template<typename T>
std::vector<std::pair<T, T>> getAllPairs(const std::vector<T>& input)
{
    std::vector<std::pair<T, T>> result;
    result.reserve(input.size() * (input.size() - 1) / 2);

    std::transform(input.begin(), input.end() - 1, input.begin() + 1, std::back_inserter(result),
                   [](const T& first, const T& second) {
                       return std::make_pair(first, second);
                   });

    return result;
}

// code written by ChatGPT. god help us all
template<typename T>
std::vector<std::pair<const T*, const T*>> getAllPairsPtrs(const std::vector<T>& input)
{
    std::vector<std::pair<const T*, const T*>> result;
    // make sure the size isn't 0, otherwise we will end up in an infinite loop
    if (input.size() > 0) {
        result.reserve(input.size() * (input.size() - 1) / 2);

        for (size_t i = 0; i < input.size() - 1; ++i) {
            for (size_t j = i + 1; j < input.size(); ++j) {
                result.emplace_back(&input[i], &input[j]);
            }
        }
    }
    return result;
}


template<typename T, typename U>
std::set<T> getKeys(std::map<T, U> m){
    std::set<T> s;
    for (auto [t, u] : m){
        s.emplace(t);
    }
    return s;
}

/**
 * extends a by adding all elements of b, in order, at the end
 * it's utterly baffling to me that this isn't a built in function in the stl
 * @tparam T any type
 * @param a
 * @param b
 */
template<typename T>
void extend(std::vector<T>& a, const std::vector<T>& b){
    // reserve space
    a.reserve(b.size());
    // copy elements
    a.insert(a.end(), b.begin(), b.end());
}
nlohmann::json json_wxyz(Eigen::Quaternionf q);
nlohmann::json json_xyz(VECTOR v);

#endif //POLYCUBES_UTILS_H
