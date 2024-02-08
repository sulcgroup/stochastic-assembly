//
// Created by josh on 5/12/23.
//

#ifndef POLYCUBES_CUBETYPE_H
#define POLYCUBES_CUBETYPE_H

#include <nlohmann/json.hpp>
#include <map>
#include <set>

#include "utils.h"
#include "Face.h"
#include "Effect.h"


const std::string JSON_CUBETYPE_TYPENAME_KEY        =   "typeName";
const std::string JSON_CUBETYPE_PATCHES_KEY         =   "patches";
const std::string JSON_CUBETYPE_STATE_KEY           =   "state_size";
const std::string JSON_CUBETYPE_CONDITIONALS_KEY    =   "conditionals";
const std::string JSON_CUBETYPE_EFFECTS_KEY         =   "effects";

class CubeType {
public:
    CubeType(int id, std::map<DirIdx, Patch> patches, int stateSize = 1, std::vector<std::shared_ptr<Effect>> effects = {}, std::string szName = "");
    std::string name() const;
    Patch patch(DirIdx i) const;
    bool hasPatch(DirIdx i) const;
    std::vector<Patch> patches() const;
    std::set<DirIdx> patchDirIdxs() const;
    int stateSize() const;
    int getID() const;
    const std::vector<std::shared_ptr<Effect>> & effects() const;

    std::vector<Move> getMoves();

protected:
    const std::string m_szName;
    const int m_TypeID;
    const std::set<DirIdx> m_PatchDirIdxs; // cache for keys of m_Patches
    const std::map<DirIdx, Patch> m_Patches;
    const std::vector<std::shared_ptr<Effect>> m_Effects;
    const int m_stateSize;
};

std::vector<CubeType> parseRule(std::string sz, int iStartIdx=0);

std::vector<CubeType> ruleFromJSON(nlohmann::json j, int iStartIdx=0);
CubeType cubeTypeFromJSON(nlohmann::json j, int ctIdx);

std::pair<int,int> getRuleColorRange(const std::vector<CubeType>& rule);

void operator<<(nlohmann::json& j, const CubeType& cubeType);

#endif //POLYCUBES_CUBETYPE_H
