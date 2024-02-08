//
// Created by josh on 5/14/23.
//

#include "Effect.h"
#include "CubeInstance.h"

/** Effect base class */
Effect::Effect(int target, float energy) :
    m_iTarget{target},
    m_fEnergy{energy} {}

int Effect::target() const {
    return m_iTarget;
}

float Effect::energy() const {
    return m_fEnergy;
}

void Effect::fire(CubeInstance &instance) const {
    instance.setStateVar(m_iTarget);
}

nlohmann::json Effect::toJSON() const {
    nlohmann::json j;
    j["target"] = target();
    j["energy"] = energy();
    return j;
}

/** Dynamic implementation */
DynamicEffect::DynamicEffect(std::vector<int> sources, int target, float energy) :
        Effect(target, energy),
        m_Sources(sources) {}

bool DynamicEffect::canFire(const CubeInstance &instance) const {
    for (int i : m_Sources){
        if (!instance.getStateVar(i))
            return false;
    }
    return true;
}

nlohmann::json DynamicEffect::toJSON() const {
    nlohmann::json j = Effect::toJSON();
    j["sources"] = m_Sources;
    return j;
}

/** Pseudo-static implementation - for legacy */
StaticEffect::StaticEffect(std::string conditional, int target) :
        Effect(target, INT_MIN),
        m_szConditional(conditional) {}

//helper function
void parse_boolean_statement(bool &status, bool operand, char &op){ //0/10 function name
    if (op == 0){
        status = operand;
    }
    else if (op == '&'){
        status &= operand;
    }
    else if (op == '|'){
        status |= operand;
    }
    else {
        std::cout << "Invalid operator " << op << std::endl;
    }
    op = 0; //reset operation
}

bool StaticEffect::canFire(const CubeInstance &instance) const {
    // pass a vector with the tautology variable missing to avoid off-by-one errors
    return evaluate(m_szConditional, {instance.getState().begin() + 1, instance.getState().end()});
}

/**
 * This entire function is basically the one from the old Polycubes impl, so
 * if you have a problem with it, take it up with Josh from like spring 2022
 * WARNING: this function is expected to be VERY SLOW. the only redeeming factor
 * is that I plan to avoid using it anyway
 * @param instance a const CubeInstance reference to use for state vals
 * @param logic a logic string
 * @return
 */
bool evaluate(std::string logic, std::vector<bool> state) {
    // evaluate string conditional
    if (logic == "true"){
        return true;
    }
    else if (logic == "false") {
        return false;
    }
    //	int paren_count = 0;
    int paren_count = 0;
    std::string::iterator paren_start;
    std::string numstr;
    bool prefix = true;
    bool negate_flag = true; // default to no negation
    char op = 0;
    for (auto it = logic.begin(); it != logic.end(); ++it) {
        if (*it == '('){
            if (paren_count == 0)
            {
                paren_start = it; //should invoke copy constructor
            }
            paren_count++;
        }
        else if (*it == ')') {
            paren_count--;
            if (paren_count == 0)
            {
                std::string subexpr(paren_start + 1, it);
                bool paren_statement_val = evaluate(subexpr, state) == negate_flag;
                parse_boolean_statement(prefix, paren_statement_val, op);
            }
        }
        else if (paren_count == 0) { //if program is mid-parentheses, continue until it finds a close-paren
            if (*it == '!' || *it || '-'){ //backwards compatibility with virtual vars, for some reason
                negate_flag = false;
                continue;

            }
            if (int('0') <= *it && *it <= int('9')) {
                numstr += *it;
                continue;
            }
            if (numstr != ""){ // either whitespace or an operator terminate a logical statement
                int varIdx = stoi(numstr);

                bool val = state[varIdx] == negate_flag;

                parse_boolean_statement(prefix, val, op);

                // clear numstr and negate_flag
                negate_flag = true;
                numstr = "";
            }
            if (*it == '&' || *it == '|') {

                op = *it;
                //deliberately no "else" here; evaluating numstr can coexist w/ operators
            }
        }
    }

    //parse suffix
    if (numstr != ""){ // either whitespace or an operator terminate a logical statement
        int varIdx = stoi(numstr);

        bool val = state[varIdx] == negate_flag;

        parse_boolean_statement(prefix, val, op);
    }

    return prefix;

}

nlohmann::json StaticEffect::toJSON() const {
    nlohmann::json j = Effect::toJSON();
    j["conditional"] = m_szConditional;
    return j;
}