//
//  EnhancePagerModule.swift
//  FollowNative
//
//  Created by Innei on 2025/3/30.
//

import ExpoModulesCore

public class EnhancePagerViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EnhancePagerView")

    View(EnhancePagerView.self) {

    }
  }
}

class EnhancePagerProps {
  @Field var initialPage: Int = 0
  @Field var pageGap: CGFloat = 0
}

private class EnhancePagerView: ExpoView {
  private var pageController: EnhancePagerController
  required init(appContext: AppContext? = nil) {
    pageController = EnhancePagerController(pageViews: [], initialPageIndex: 0)

    super.init(appContext: appContext)

    addSubview(pageController.view)
    pageController.view.snp.makeConstraints { make in
      make.edges.equalToSuperview()
    }
  }

  override func insertSubview(_ view: UIView, at index: Int) {
    pageController.insertPageView(view: view, animated: false)
  }

  func willRemoveSubview(_ subview: UIView, at index: Int) {
    pageController.removePageView(at: index)
  }

  #if RCT_NEW_ARCH_ENABLED
    override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
      if childComponentView is EnhancePageView {
        self.insertSubview(childComponentView, at: index)
      }
    }

    override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
      if childComponentView is EnhancePageView {
        self.willRemoveSubview(childComponentView, at: index)
      }
    }
  #endif

}
