//
// Created by josh on 5/12/23.
//

#include <bitset>
#include <boost/algorithm/string.hpp>

#include "CubeType.h"

CubeType::CubeType(int id,
                   std::map<DirIdx, Patch> patches,
                   int stateSize,
                   std::vector<std::shared_ptr<Effect>> effects,
                   std::string szName) :
        m_TypeID{id},
        m_Patches{patches},
        m_PatchDirIdxs{getKeys(patches)},
        m_stateSize{stateSize},
        m_Effects{effects},
        m_szName(szName.empty() ? constructCubeTypeName(id) : szName)
{}

std::string CubeType::name() const {
    return m_szName;
}

Patch CubeType::patch(DirIdx i) const {
    ASSERT(hasPatch(i), "No patch with direction index " << i << " in this cube type");
    return m_Patches.at(i);
}

bool CubeType::hasPatch(DirIdx i) const {
    return m_Patches.contains(i); // TODO: double check that this is correct
}

std::set<DirIdx> CubeType::patchDirIdxs() const {
    return m_PatchDirIdxs;
}

std::vector<Patch> CubeType::patches() const {
    std::vector<Patch> ptchs;
    for (auto d : m_PatchDirIdxs){
        ptchs.push_back(patch(d));
    }
    return ptchs;
}

int CubeType::stateSize() const {
    return m_stateSize;
}

int CubeType::getID() const {
    return m_TypeID;
}

const std::vector<std::shared_ptr<Effect>> & CubeType::effects() const {
    return m_Effects;
}

/**
 * lists moves available for unbound cubes
 * @return
 */
std::vector<Move> CubeType::getMoves() {
    std::vector<Move> moves;
    for (auto k : m_PatchDirIdxs){
        Patch p = patch(k);
        // if patch has activation var that's either tautology (0) or negative (begin True)
        if (p.activationVar() <= 0){
            moves.push_back({p, VECTOR::Zero()});
        }
    }
    return moves;
}

std::vector<CubeType> parseRule(std::string ruleStr, int iStartIdx) {
    if (isHex(ruleStr)){
        if (ruleStr.size() % 2*DirIdx::NUM_DIR_IDXS != 0) {
            std::cerr<<"Error: Incomplete rule: "<<ruleStr<<std::endl;
            exit(EXIT_FAILURE);
        }
        std::vector<CubeType> rule;
        for(size_t i = 0; i < ruleStr.size(); i += 2 * DirIdx::NUM_DIR_IDXS) {
            //std::cout<<"Rule "<<(i/(2*ruleSize))+1<<std::endl;
            std::map<DirIdx, Patch> patches;
            for (size_t j = 0; j < DirIdx::NUM_DIR_IDXS; j++) {
                std::string s = ruleStr.substr(i+(2*j), 2);
                int hex = std::stoi(s, 0, 16);
                std::bitset<8> bitset(hex);
                std::bitset<8> colorMask(0b01111100);
                std::bitset<8> orientationMask(0b00000011);
                int color = ((bitset & colorMask) >> 2).to_ulong();
                if(bitset[7]) color *= -1; // Why is there no .to_long()?
                DirIdx orientation = DirIdx(int((bitset & orientationMask).to_ulong()));
                //std::cout<<"Colour: "<<color<<"\t Orientation: "<<orientation<<std::endl;
                patches.emplace(DirIdx(j), Patch(RULE_ORDER[j], getOrientation(DirIdx(j), orientation), color));
            }
            rule.push_back(CubeType(iStartIdx + i / DirIdx::NUM_DIR_IDXS, patches));
            //std::cout<<std::endl;
        }
        return rule;
    }
    else if (isDecStatic(ruleStr))
    {
        std::vector<CubeType> rule;
        int ctidx = 0;
        std::string face;
        std::vector<bool> zerostate;
        zerostate.resize(NUM_DIR_IDXS, false);
        std::vector<std::shared_ptr<Effect>> effects;
        for (std::string s: splitString(ruleStr, '_')) {
            int i = 0;
            std::map<DirIdx, Patch> patches;
            int maxVar = 0;
            std::vector<std::string> faces = splitString(s, '#');
            for (i = 0; i < faces.size(); i++) {
                face = faces[i];
                int color, orientation, stateVar, activationVar = 0;
                if (face == "") {
                    continue;
                } else {
                    std::vector<std::string> values = splitString(face, ':');
                    ASSERT(3 >= values.size() && values.size() >= 2, "Wrong number of values for face " << face
                                                                                  << ". Expected 4: color, orientation, state var, activation var");
                    color = std::stoi(values[0]);
                    orientation = std::stoi(values[1]);
                    stateVar = activationVar = 0;
                    if (values.size() == 3) {
                        std::string conditional = values[2];
                        boost::trim(conditional); // trim spaces, probably unnessceary
                        stateVar = i + 1;
                        activationVar = NUM_DIR_IDXS + i + 1;
                        if (evaluate(conditional, zerostate)) {
                            activationVar -= activationVar;
                        }
                        if (conditional.size() > 0 && conditional != "(true)") {
                            effects.emplace_back(std::shared_ptr<Effect>(new StaticEffect(conditional, activationVar)));
                        }
                    }
                }
                patches.emplace(DirIdx(i),
                                Patch(RULE_ORDER[i],
                                      getOrientation(DirIdx(i),
                                                     DirIdx(orientation)),
                                      color,
                                      stateVar,
                                      activationVar));
            }
            rule.emplace_back(iStartIdx + ctidx, patches, 2 * NUM_DIR_IDXS + 1, effects);
            ctidx++;
        }
        return rule;
    }
    else if (isDecDynamic(ruleStr))
    {
        std::vector<CubeType> rule;
        int ctidx = 0;
        for (std::string s: splitString(ruleStr, '_')) {
            int i = 0;
            std::map<DirIdx, Patch> patches;
            int maxVar = 0;
            for (std::string face : splitString(s, '#')) {
                int color, orientation, stateVar, activationVar = 0;
                if (face == "") {
                    continue;
                } else {
                    std::vector<std::string> values = splitString(face, ':');
                    ASSERT(values.size() == 4, "Wrong number of values for face " << face << ". Expected 4: color, orientation, state var, activation var");
                    color = std::stoi(values[0]);
                    orientation = std::stoi(values[1]);
                    stateVar = std::stoi(values[2]);
                    activationVar = std::stoi(values[3]);
                }
                maxVar = std::max(maxVar, abs(stateVar) + 1);
                maxVar = std::max(maxVar, abs(activationVar) + 1);
                patches.emplace(DirIdx(i),
                                Patch(RULE_ORDER[i],
                                      getOrientation(DirIdx(i),
                                                     DirIdx(orientation)),
                                      color,
                                      stateVar,
                                      activationVar));
                i++;
            }
            rule.emplace_back(iStartIdx + ctidx, patches, maxVar);
            ctidx++;
        }
        return rule;
    }
    // default to Bohlin-type Dec Rule
    else {
        std::vector<CubeType> rule;
        int ctidx = 0;
        for (std::string s: splitString(ruleStr, '_')) {
            int i = 0;
            std::map<DirIdx, Patch> patches;
            char delim = '|'; // TODO: enable switching with Joakim's OTHER format
            for (std::string face: splitString(s, delim)) {
                int color, orientation;
                if (face == "") {
                    color = orientation = 0;
                } else {
                    std::vector<std::string> values = splitString(face, ':');
                    color = std::stoi(values[0]);
                    orientation = std::stoi(values[1]);
                }
                patches.emplace(DirIdx(i),
                                Patch(RULE_ORDER[i],
                                      getOrientation(DirIdx(i),
                                                     DirIdx(orientation)),
                                                     color));
                i++;
            }
            rule.push_back(CubeType(iStartIdx + ctidx, patches));
            ctidx++;
        }
        return rule;
    }
}

/**
 * Constructs a rule (list of cube types) from a json file
 * @param j
 * @return
 */
std::vector<CubeType> ruleFromJSON(nlohmann::json j, int iStartIdx) {
    std::vector<CubeType> rule;
    for (int i = 0; i < j.size(); i++){
        rule.push_back(cubeTypeFromJSON(j[i], iStartIdx + i));
    }
    return rule;
}

CubeType cubeTypeFromJSON(nlohmann::json j, int ctIdx) {
    std::map<DirIdx, Patch> patches;
    for (int i = 0; i < j[JSON_CUBETYPE_PATCHES_KEY].size(); i++)
    {
        nlohmann::json j_patch = j[JSON_CUBETYPE_PATCHES_KEY][i];
        if (j_patch["color"] == 0){
            continue;
        }
        VECTOR patch_dir;
        // forwards-compatability in case I decide to reformat the jsons like an IDIOT
        if (j_patch.contains("dir")){
            patch_dir = VECTOR(
                    j_patch["dir"]["x"],
                    j_patch["dir"]["y"],
                    j_patch["dir"]["z"]);
        }
        else {
            patch_dir = RULE_ORDER[i];
        }
        DirIdx patch_dir_idx = diridx(patch_dir);
        VECTOR patch_align(
                j_patch["alignDir"]["x"],
                j_patch["alignDir"]["y"],
                j_patch["alignDir"]["z"]);
        int color = j_patch["color"];

        // state and activation variables
        int state_var = j_patch["state_var"];
        int activation_var = j_patch["activation_var"];

        patches.emplace(patch_dir_idx, Patch(
               patch_dir,
               patch_align,
               color,
               state_var,
               activation_var
        ));
    }

    std::vector<std::shared_ptr<Effect>> effects;
    if (j.contains(JSON_CUBETYPE_CONDITIONALS_KEY)){
        for (int i = 0; i < j[JSON_CUBETYPE_CONDITIONALS_KEY].size(); i++){
            effects.emplace_back(std::make_shared<StaticEffect>(j[JSON_CUBETYPE_CONDITIONALS_KEY][i], i));
        }
    }
    else {
        ASSERT(j.contains(JSON_CUBETYPE_EFFECTS_KEY), "JSON file lacks keys for either conditionals or effects");
        for (auto &j_effect : j[JSON_CUBETYPE_EFFECTS_KEY]){
            float e;
            if (j_effect.contains("energy")){
                e = j_effect["energy"];
            }
            else {
                e = -FP_INFINITE; // if no energy specified, infinately energetically favorable
            }
            // if this explodes, it will explode some other day
            effects.emplace_back(std::make_shared<DynamicEffect>(j_effect["sources"].get<std::vector<int>>(),
                                                                 j_effect["target"].get<int>(),
                                                                 e));
        }
    }

    return {
            ctIdx, patches, int(j[JSON_CUBETYPE_STATE_KEY].size()), effects, j[JSON_CUBETYPE_TYPENAME_KEY]
    };
}

std::pair<int,int> getRuleColorRange(const std::vector<CubeType> &rule) {
    std::pair<int,int> minmax = {0,0};
    for (const CubeType& ct : rule){
        for (Patch p : ct.patches()){
            minmax.first = std::min(p.color(), minmax.first);
            minmax.second = std::max(p.color(), minmax.second);
        }
    }
    return minmax;
}

void operator<<(nlohmann::json &j, const CubeType &cubeType) {
    j[JSON_CUBETYPE_TYPENAME_KEY] = cubeType.name();
    j[JSON_CUBETYPE_PATCHES_KEY] = nlohmann::json::array();
    for (Patch p : cubeType.patches()){
        nlohmann::json patchj;
        patchj << p;
        j[JSON_CUBETYPE_PATCHES_KEY].push_back(patchj);
    }
    j[JSON_CUBETYPE_EFFECTS_KEY] = nlohmann::json::array();
    for (std::shared_ptr<Effect> e : cubeType.effects()) {
        j[JSON_CUBETYPE_EFFECTS_KEY].push_back(e->toJSON());
    }
    j[JSON_CUBETYPE_STATE_KEY] = cubeType.stateSize();
}

