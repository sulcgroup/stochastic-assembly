//
// Created by josh on 5/14/23.
//

#ifndef POLYCUBES_EFFECT_H
#define POLYCUBES_EFFECT_H

#include <vector>
#include <string>
#include <nlohmann/json.hpp>

class CubeInstance;

class Effect {
public:
    int target() const;
    float energy() const;
    virtual bool canFire(const CubeInstance &instance) const {}; // empty defn so linker doesn't throw a fit
    void fire(CubeInstance& instance) const;
    virtual nlohmann::json toJSON() const;
protected:
    Effect(int target, float energy);
    const int m_iTarget;
    const float m_fEnergy; // energetic favorability of this effect
};

class DynamicEffect : public Effect {
public:
    DynamicEffect(std::vector<int> sources, int target, float energy);
    bool canFire(const CubeInstance &instance) const override;
    nlohmann::json toJSON() const override;
protected:
    const std::vector<int> m_Sources;
    // TODO: stochastic firing probability
};

// largely for backwards-compatibility
class StaticEffect : public Effect {
public:
    StaticEffect(std::string conditional, int target);
    bool canFire(const CubeInstance &instance) const override;
    nlohmann::json toJSON() const override;
protected:
    const std::string m_szConditional;
};

bool evaluate(std::string logic, std::vector<bool> state);

#endif //POLYCUBES_EFFECT_H
